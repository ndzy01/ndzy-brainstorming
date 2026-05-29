import { IsString, IsUUID } from 'class-validator';

export class EndGameDto {
  @IsString()
  anonymousId!: string;

  @IsUUID('4')
  sessionId!: string;
}