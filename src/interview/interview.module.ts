import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterviewSession } from '../entities/interview-session.entity';
import { InterviewService } from './interview.service';
import { InterviewController } from './interview.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InterviewSession])],
  controllers: [InterviewController],
  providers: [InterviewService],
})
export class InterviewModule {}