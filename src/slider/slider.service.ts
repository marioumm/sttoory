import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';
import { Slider } from './entities/Slider';

@Injectable()
export class SliderService {
  private s3Client: S3Client;
  constructor(
    @InjectRepository(Slider)
    private sliderRepo: Repository<Slider>,
  ) {
    if (!process.env.AWS_S3_BUCKET_NAME || !process.env.AWS_REGION) {
      throw new Error('Missing required AWS environment variables');
    }

    this.s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  async getAll(): Promise<Slider[]> {
    return this.sliderRepo.find();
  }

  async getById(id: number): Promise<Slider> {
    const slider = await this.sliderRepo.findOne({ where: { id } });

    if (!slider) {
      throw new NotFoundException(`Slider with ID ${id} not found`);
    }

    return slider;
  }

  async create(
    data: Partial<Slider>,
    imageFile: Express.Multer.File,
  ): Promise<Slider> {
    const sliderCount = await this.sliderRepo.count();
    if (sliderCount >= 3) {
      throw new BadRequestException('You can only have 3 sliders');
    }

    // Validate the image file
    this.validateImageFile(imageFile);

    // Upload image to S3
    const imageUrl = await this.uploadImage(imageFile);

    // Create slider with image URL
    const slider = this.sliderRepo.create({
      ...data,
      imageUrl, // Assuming your Slider entity has an imageUrl field
    });

    return this.sliderRepo.save(slider);
  }

  async update(id: number, data: Partial<Slider>): Promise<Slider> {
    const slider = await this.sliderRepo.findOne({ where: { id } });
    if (!slider) {
      throw new NotFoundException(`Slider with ID ${id} not found`);
    }

    Object.assign(slider, data);
    return this.sliderRepo.save(slider);
  }

  private validateImageFile(file: Express.Multer.File): void {
    const allowedImageTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ];

    const maxSize = 10 * 1024 * 1024; // 10MB for slider images

    if (file.size > maxSize) {
      throw new BadRequestException('Image size must be less than 10MB');
    }

    if (!allowedImageTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed types: ${allowedImageTypes.join(', ')}`,
      );
    }
  }

  private async uploadImage(file: Express.Multer.File): Promise<string> {
    const fileExtension = extname(file.originalname);
    const filename = `${uuidv4()}${fileExtension}`;

    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: `sliders/${filename}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    try {
      await this.s3Client.send(new PutObjectCommand(uploadParams));
      return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/sliders/${filename}`;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new BadRequestException('Failed to upload image to S3');
    }
  }

  async delete(id: number): Promise<void> {
    // Find the slider to get the image URL before deletion
    const slider = await this.sliderRepo.findOne({ where: { id } });
    if (!slider) {
      throw new NotFoundException(`Slider with ID ${id} not found`);
    }

    try {
      // Delete the image from S3 if it exists
      if (slider.imageUrl) {
        await this.deleteImageFromS3(slider.imageUrl);
      }

      // Delete the slider from database
      await this.sliderRepo.delete(id);
    } catch (error) {
      console.error('Error deleting slider:', error);
      throw new BadRequestException('Failed to delete slider');
    }
  }

  private async deleteImageFromS3(imageUrl: string): Promise<void> {
    try {
      // Extract the key from the S3 URL
      const url = new URL(imageUrl);
      const key = url.pathname.substring(1); // Remove leading slash

      const deleteParams = {
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: key,
      };

      await this.s3Client.send(new DeleteObjectCommand(deleteParams));
      console.log(`Successfully deleted image: ${key}`);
    } catch (error) {
      console.error('S3 delete error:', error);
      // Did not throw error to avoid database failure
    }
  }
}
