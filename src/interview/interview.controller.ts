import { Controller, Post, Body, Res, Get, Param, Delete } from '@nestjs/common';
import type { Response } from 'express';
import { InterviewService } from './interview.service';
import { StartInterviewDto } from './dto/start.dto';
import { AnswerDto } from './dto/answer.dto';
import { ResumeDto } from './dto/resume.dto';

@Controller('interview')
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  /** 流式创建新面试 */
  @Post('start')
  async startInterview(
    @Body() body: StartInterviewDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    let sessionId = '';
    for await (const { chunk, sessionId: sid } of this.interviewService.createSession(
      body.anonymousId,
      body.position,
      body.difficulty,
      body.totalQuestions ?? 5,
    )) {
      if (sid) sessionId = sid;
      res.write(chunk);
    }
    res.write(`\n<!--SESSION_ID:${sessionId}-->`);
    res.end();
  }

  /** 流式回答 */
  @Post('answer')
  async answer(
    @Body() body: AnswerDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const { chunk } of this.interviewService.answer(
      body.anonymousId,
      body.sessionId,
      body.answer,
    )) {
      res.write(chunk);
    }
    res.end();
  }

  /** 续玩流式 */
  @Post('resume')
  async resume(
    @Body() body: ResumeDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    let sessionId = '';
    for await (const { chunk, sessionId: sid } of this.interviewService.resume(
      body.anonymousId,
      body.sessionId,
    )) {
      if (sid) sessionId = sid;
      res.write(chunk);
    }
    res.write(`\n<!--SESSION_ID:${sessionId}-->`);
    res.end();
  }

  /** 获取历史列表 */
  @Get('history/:anonymousId')
  async getHistory(@Param('anonymousId') anonymousId: string) {
    return this.interviewService.getHistory(anonymousId);
  }

  /** 获取单个会话详情 */
  @Get('session/:anonymousId/:sessionId')
  async getSession(
    @Param('anonymousId') anonymousId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.interviewService.getSession(anonymousId, sessionId);
  }

  /** 删除会话 */
  @Delete('session/:anonymousId/:sessionId')
  async deleteSession(
    @Param('anonymousId') anonymousId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.interviewService.deleteSession(anonymousId, sessionId);
  }
}
