import { IsString, IsUUID } from 'class-validator';

export class AnswerDto {
  @IsString()
  anonymousId!: string;

  @IsUUID('4')
  sessionId!: string;

  @IsString()
  answer!: string;
}