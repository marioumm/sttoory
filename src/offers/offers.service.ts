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
import { Offer } from './entities/Offers';

@Injectable()
export class OffersService {
  private s3Client: S3Client;
  constructor(
    @InjectRepository(Offer)
    private offerRepo: Repository<Offer>,
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

  async getAll(): Promise<Offer[]> {
    return this.offerRepo.find();
  }

  async getById(id: number): Promise<Offer> {
    const offer = await this.offerRepo.findOne({ where: { id } });

    if (!offer) {
      throw new NotFoundException(`Offer with ID ${id} not found`);
    }

    return offer;
  }

  async create(
    data: Partial<Offer>,
    imageFile: Express.Multer.File,
  ): Promise<Offer> {
    const offerCount = await this.offerRepo.count();
    if (offerCount >= 3) {
      throw new BadRequestException('You can only have 3 sliders');
    }

    // Validate the image file
    this.validateImageFile(imageFile);

    // Upload image to S3
    const imageUrl = await this.uploadImage(imageFile);

    // Create slider with image URL
    const offer = this.offerRepo.create({
      ...data,
      imageUrl, // Assuming your Slider entity has an imageUrl field
    });

    return this.offerRepo.save(offer);
  }

  async update(id: number, data: Partial<Offer>): Promise<Offer> {
    const offer = await this.offerRepo.findOne({ where: { id } });
    if (!offer) {
      throw new NotFoundException(`Slider with ID ${id} not found`);
    }

    Object.assign(offer, data);
    return this.offerRepo.save(offer);
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
      Key: `offers/${filename}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    try {
      await this.s3Client.send(new PutObjectCommand(uploadParams));
      return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/offers/${filename}`;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new BadRequestException('Failed to upload image to S3');
    }
  }

  async delete(id: number): Promise<void> {
    // Find the slider to get the image URL before deletion
    const offer = await this.offerRepo.findOne({ where: { id } });
    if (!offer) {
      throw new NotFoundException(`Slider with ID ${id} not found`);
    }

    try {
      // Delete the image from S3 if it exists
      if (offer.imageUrl) {
        await this.deleteImageFromS3(offer.imageUrl);
      }

      // Delete the slider from database
      await this.offerRepo.delete(id);
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
