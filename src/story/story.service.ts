import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { ObjectCannedACL } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import * as ffmpeg from 'fluent-ffmpeg';
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { CreateStoryDto } from './dtos/create-story.dto';
import { UpdateStoryDto } from './dtos/update-story.dto';
import { StoryResponseDto } from './dtos/story-response.dto';
import { Story } from './entities/Story';

@Injectable()
export class StoryService {
  private s3Client: S3Client;

  constructor(
    @InjectRepository(Story)
    private storyRepository: Repository<Story>,
  ) {
    if (!process.env.AWS_S3_BUCKET_NAME || !process.env.AWS_REGION) {
      throw new Error('Missing required AWS environment variables');
    }

    ffmpeg.setFfmpegPath(ffmpegInstaller.path);

    this.s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  async createStory(
    createStoryDto: CreateStoryDto,
    mediaFile: Express.Multer.File
  ): Promise<StoryResponseDto> {
    const mediaType = await this.validateMediaFile(mediaFile);
    console.log(createStoryDto);
    // Calculate duration for videos
    let duration = 0;
    if (mediaType === 'video') {
      duration = await this.getVideoDuration(mediaFile);
      if (duration > 30) {
        throw new BadRequestException(
          'Video duration must not exceed 30 seconds',
        );
      }
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const mediaUrl = await this.uploadFile(mediaFile);

    const story = this.storyRepository.create({
      ...createStoryDto,
      mediaUrl,
      mediaType,
      duration,
      expiresAt,
    });

    const savedStory = await this.storyRepository.save(story);
    return this.mapToResponseDto(savedStory);
  }

  async getAllStories(): Promise<StoryResponseDto[]> {
    const stories = await this.storyRepository.find({
      order: { createdAt: 'DESC' },
    });
    return stories.map((story) => this.mapToResponseDto(story));
  }

  async getActiveStories(): Promise<StoryResponseDto[]> {
    const currentTime = new Date();
    const stories = await this.storyRepository.find({
      where: {
        isActive: true,
        expiresAt: MoreThan(currentTime),
      },
      order: { createdAt: 'DESC' },
    });
    return stories.map((story) => this.mapToResponseDto(story));
  }

  async getStoryById(id: string): Promise<StoryResponseDto> {
    const story = await this.storyRepository.findOne({ where: { id } });
    if (!story) {
      throw new NotFoundException('Story not found');
    }
    return this.mapToResponseDto(story);
  }

  async updateStory(
    id: string,
    updateStoryDto: UpdateStoryDto,
    mediaFile?: Express.Multer.File,
    adminId?: string,
  ): Promise<StoryResponseDto> {
    const story = await this.storyRepository.findOne({ where: { id } });
    if (!story) {
      throw new NotFoundException('Story not found');
    }

    let mediaUrl = story.mediaUrl;
    let mediaType = story.mediaType;
    let duration = story.duration;

    if (mediaFile) {
      // Delete old media file
      await this.deleteFileFromS3(story.mediaUrl);

      // Upload new media file
      mediaType = await this.validateMediaFile(mediaFile);
      mediaUrl = await this.uploadFile(mediaFile);

      // Calculate new duration for videos
      if (mediaType === 'video') {
        duration = await this.getVideoDuration(mediaFile);
        if (duration > 30) {
          throw new BadRequestException(
            'Video duration must not exceed 30 seconds',
          );
        }
      } else {
        duration = 30;
      }
    }

    // Update story
    Object.assign(story, {
      ...updateStoryDto,
      ...(mediaFile && { mediaUrl, mediaType, duration }),
      ...(adminId && { updatedBy: adminId }),
      updatedAt: new Date(),
    });

    const updatedStory = await this.storyRepository.save(story);
    return this.mapToResponseDto(updatedStory);
  }

  async deleteStory(id: string): Promise<void> {
    const story = await this.storyRepository.findOne({ where: { id } });
    if (!story) {
      throw new NotFoundException('Story not found');
    }

    // Delete media file from S3
    await this.deleteFileFromS3(story.mediaUrl);

    // Delete story from database
    await this.storyRepository.remove(story);
  }

  async deactivateExpiredStories(): Promise<void> {
    const currentTime = new Date();
    // Fixed: Use LessThan to find actually expired stories
    const expiredStories = await this.storyRepository.find({
      where: {
        isActive: true,
        expiresAt: LessThan(currentTime),
      },
    });

    // Batch update for better performance
    if (expiredStories.length > 0) {
      await this.storyRepository.update(
        {
          isActive: true,
          expiresAt: LessThan(currentTime),
        },
        { isActive: false },
      );
    }
  }

  private async validateMediaFile(
    file: Express.Multer.File,
  ): Promise<'photo' | 'video'> {
    const allowedImageTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp', // Added webp support
    ];
    const allowedVideoTypes = [
      'video/mp4',
      'video/mov',
      'video/avi', // Added more video formats
      'video/quicktime',
    ];
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (file.size > maxSize) {
      throw new BadRequestException('File size must be less than 50MB');
    }

    if (allowedImageTypes.includes(file.mimetype)) {
      return 'photo';
    } else if (allowedVideoTypes.includes(file.mimetype)) {
      return 'video';
    } else {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed types: ${[...allowedImageTypes, ...allowedVideoTypes].join(', ')}`,
      );
    }
  }

  private async getVideoDuration(file: Express.Multer.File): Promise<number> {
    const tempFilePath = join(
      tmpdir(),
      `${randomUUID()}${extname(file.originalname)}`,
    );

    try {
      await writeFile(tempFilePath, file.buffer);

      const duration = await new Promise<number>((resolve, reject) => {
        ffmpeg.ffprobe(tempFilePath, (err, metadata) => {
          if (err) {
            console.error('FFprobe error:', err);
            return reject(
              new BadRequestException('Unable to process video file'),
            );
          }

          const videoDuration = metadata?.format?.duration;
          if (typeof videoDuration !== 'number') {
            return reject(
              new BadRequestException('Unable to determine video duration'),
            );
          }

          resolve(Math.round(videoDuration));
        });
      });

      return duration;
    } catch (error) {
      console.error('Video processing error:', error);
      throw new BadRequestException('Failed to process video file');
    } finally {
      // Ensure temp file is always cleaned up
      try {
        await unlink(tempFilePath);
      } catch (unlinkError) {
        console.warn('Failed to cleanup temp file:', unlinkError);
      }
    }
  }

  private async uploadFile(file: Express.Multer.File): Promise<string> {
    const fileExtension = extname(file.originalname);
    const filename = `${uuidv4()}${fileExtension}`;

    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: `stories/${filename}`,
      Body: file.buffer,
      ContentType: file.mimetype,
      // ACL: ObjectCannedACL.public_read,
    };

    try {
      await this.s3Client.send(new PutObjectCommand(uploadParams));
      return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/stories/${filename}`;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new BadRequestException('Failed to upload file to S3');
    }
  }

  private async deleteFileFromS3(fileUrl: string): Promise<void> {
    try {
      // More robust URL parsing
      const url = new URL(fileUrl);
      const pathParts = url.pathname.split('/');
      const filename = pathParts[pathParts.length - 1];
      const key = `stories/${filename}`;

      const deleteParams = {
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: key,
      };

      await this.s3Client.send(new DeleteObjectCommand(deleteParams));
    } catch (error) {
      console.error('S3 delete error:', error);
      // Don't throw error for delete failures to prevent blocking the main operation
    }
  }

  private mapToResponseDto(story: Story): StoryResponseDto {
    return {
      id: story.id,
      title: story.title,
      description: story.description,
      mediaUrl: story.mediaUrl,
      mediaType: story.mediaType,
      duration: story.duration,
      expiresAt: story.expiresAt,
      createdAt: story.createdAt,
      isActive: story.isActive,
    };
  }
}
