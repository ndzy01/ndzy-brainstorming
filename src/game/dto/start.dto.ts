import { IsString, IsInt, Min, Max, IsOptional } from 'class-validator';

export class StartGameDto {
  @IsString()
  anonymousId!: string;

  @IsString()
  genre!: string;

  @IsString()
  style!: string;

  /** 最大幕数（3-200），不传默认 30 */
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(200)
  maxTurns?: number;
}