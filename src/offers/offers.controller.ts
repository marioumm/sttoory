import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/story/guards/jwt-auth.guard';
import { AdminGuard } from 'src/story/guards/admin.guard';
import { OffersService } from './offers.service';
import { Offer } from './entities/Offers';

@Controller('offers')
export class OffersController {
  constructor(private readonly offerService: OffersService) {}

  @Get()
  async getAll(): Promise<Offer[]> {
    return this.offerService.getAll();
  }

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number): Promise<Offer> {
    return this.offerService.getById(id);
  }
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post()
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @Body() body: Partial<Offer>,
    @UploadedFile() image: Express.Multer.File,
  ): Promise<Offer> {
    if (!image) {
      throw new BadRequestException('Image is required');
    }
    return this.offerService.create(body, image);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<Offer>,
  ): Promise<Offer> {
    return this.offerService.update(id, body);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete(':id')
  async delete(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    await this.offerService.delete(id);
    return { message: 'Slider deleted successfully' };
  }
}
