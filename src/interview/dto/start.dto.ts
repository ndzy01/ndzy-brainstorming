import { IsString, IsIn, IsInt, Min, Max, IsOptional } from 'class-validator';

export class StartInterviewDto {
  @IsString()
  anonymousId!: string;

  @IsString()
  position!: string;

  @IsString()
  @IsIn(['初级', '中级', '高级'])
  difficulty!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  totalQuestions?: number;
}