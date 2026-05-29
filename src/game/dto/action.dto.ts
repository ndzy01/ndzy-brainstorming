import { IsString, IsUUID } from 'class-validator';

export class PlayerActionDto {
  @IsString()
  anonymousId!: string;

  @IsUUID('4')
  sessionId!: string;

  @IsString()
  action!: string;
}