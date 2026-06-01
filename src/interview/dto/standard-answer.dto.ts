import { IsString, IsUUID, IsInt, Min, IsOptional, IsBoolean } from 'class-validator';

export class StandardAnswerDto {
  @IsString()
  anonymousId!: string;

  @IsUUID('4')
  sessionId!: string;

  @IsInt()
  @Min(0)
  questionIndex!: number;

  @IsOptional()
  @IsBoolean()
  forceRegenerate?: boolean;
}
