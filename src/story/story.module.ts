import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Story } from './entities/Story';
import { StoryController } from './story.controller';
import { StoryService } from './story.service';
import { StoryCleanupTask } from './tasks/story-cleanup.task';

@Module({
  imports: [
    TypeOrmModule.forFeature([Story]),
    ScheduleModule.forRoot(), // Enable scheduling
  ],
  controllers: [StoryController],
  providers: [
    StoryService,
    StoryCleanupTask, // Add the cleanup task
  ],
  exports: [StoryService],
})
export class StoryModule {}
