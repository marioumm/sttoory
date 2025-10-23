import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StoryService } from '../story.service';

@Injectable()
export class StoryCleanupTask {
  constructor(private readonly storyService: StoryService) {}

  // Run every hour to check for expired stories
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredStories() {
    console.log('Running story cleanup task...');
    try {
      await this.storyService.deactivateExpiredStories();
      console.log('Story cleanup completed successfully');
    } catch (error) {
      console.error('Story cleanup failed:', error);
    }
  }

  // Optional: Run at midnight every day for more thorough cleanup
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyCleanup() {
    console.log('Running daily story cleanup...');
    try {
      await this.storyService.deactivateExpiredStories();
      console.log('Daily story cleanup completed successfully');
    } catch (error) {
      console.error('Daily story cleanup failed:', error);
    }
  }
}
