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
import { SliderService } from './slider.service';
import { Slider } from './entities/Slider';
import { JwtAuthGuard } from 'src/story/guards/jwt-auth.guard';
import { AdminGuard } from 'src/story/guards/admin.guard';

@Controller('sliders')
export class SliderController {
  constructor(private readonly sliderService: SliderService) {}

  @Get()
  async getAll(): Promise<Slider[]> {
    return this.sliderService.getAll();
  }

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number): Promise<Slider> {
    return this.sliderService.getById(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post()
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @Body() body: Partial<Slider>,
    @UploadedFile() image: Express.Multer.File,
  ): Promise<Slider> {
    if (!image) {
      throw new BadRequestException('Image is required');
    }
    return this.sliderService.create(body, image);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<Slider>,
  ): Promise<Slider> {
    return this.sliderService.update(id, body);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete(':id')
  async delete(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    await this.sliderService.delete(id);
    return { message: 'Slider deleted successfully' };
  }
}
