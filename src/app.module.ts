import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { StoryService } from './story/story.service';
import { StoryController } from './story/story.controller';
import { StoryModule } from './story/story.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Story } from './story/entities/Story';
import { SliderController } from './slider/slider.controller';
import { SliderService } from './slider/slider.service';
import { SliderModule } from './slider/slider.module';
import { OffersModule } from './offers/offers.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT),
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      autoLoadEntities: true,
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Story]),
    StoryModule,
    SliderModule,
    OffersModule,
  ],
  controllers: [StoryController],
  providers: [StoryService],
})
export class AppModule {}
