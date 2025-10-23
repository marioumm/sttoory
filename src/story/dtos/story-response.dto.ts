export class StoryResponseDto {
  id: string;
  title: string;
  description?: string;
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  duration: number;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}
