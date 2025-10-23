import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Request,
  BadRequestException,
  ValidationPipe,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StoryService } from './story.service';
import { CreateStoryDto } from './dtos/create-story.dto';
import { UpdateStoryDto } from './dtos/update-story.dto';
import { StoryResponseDto } from './dtos/story-response.dto';
import { AdminGuard } from './guards/admin.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('stories')
export class StoryController {
  constructor(private readonly storyService: StoryService) {}

  @UseGuards(JwtAuthGuard,AdminGuard)
  @Post()
  @UseInterceptors(FileInterceptor('mediaFile'))
  async createStory(
    @Body(new ValidationPipe()) createStoryDto: CreateStoryDto,
    @UploadedFile() mediaFile: Express.Multer.File,
  ): Promise<StoryResponseDto> {
    console.log(createStoryDto);

    if (!mediaFile) {
      throw new BadRequestException('Media file is required');
    }
    console.log('Media file', mediaFile);

    return await this.storyService.createStory(createStoryDto, mediaFile);
  }

  @Get()
  async getAllStories(): Promise<StoryResponseDto[]> {
    return await this.storyService.getAllStories();
  }

  @Get('/active')
  async getActiveStories(): Promise<StoryResponseDto[]> {
    return await this.storyService.getActiveStories();
  }

  @Get('/:id')
  async getStoryById(@Param('id') id: string): Promise<StoryResponseDto> {
    return await this.storyService.getStoryById(id);
  }

  @UseGuards(JwtAuthGuard,AdminGuard)
  @Put('/:id')
  @UseInterceptors(FileInterceptor('media'))
  async updateStory(
    @Param('id') id: string,
    @Body(new ValidationPipe()) updateStoryDto: UpdateStoryDto,
    @UploadedFile() mediaFile?: Express.Multer.File,
    @Request() req?: any,
  ): Promise<StoryResponseDto> {
    return await this.storyService.updateStory(
      id,
      updateStoryDto,
      mediaFile,
      req?.user?.id,
    );
  }

  @UseGuards(JwtAuthGuard,AdminGuard)
  @Delete('/:id')
  async deleteStory(@Param('id') id: string): Promise<{ message: string }> {
    await this.storyService.deleteStory(id);
    return { message: 'Story deleted successfully' };
  }
}
