import { IsString, IsUUID } from 'class-validator';

export class ResumeDto {
  @IsString()
  anonymousId!: string;

  @IsUUID('4')
  sessionId!: string;
}