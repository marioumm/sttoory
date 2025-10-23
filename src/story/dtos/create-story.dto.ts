import {
  IsString,
  IsOptional,
  IsNotEmpty
} from 'class-validator';

export class CreateStoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  title: string;

  @IsString()
  @IsOptional()
  description?: string;
}
