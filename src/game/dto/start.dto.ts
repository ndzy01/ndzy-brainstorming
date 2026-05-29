import { IsString } from 'class-validator';

export class StartGameDto {
  @IsString()
  anonymousId!: string;

  @IsString()
  genre!: string;

  @IsString()
  style!: string;
}