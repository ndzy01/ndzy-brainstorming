import { Controller, Post, Body, Res, Get, Param, Delete, HttpCode, ParseUUIDPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { InterviewService } from './interview.service';
import { StartInterviewDto } from './dto/start.dto';
import { AnswerDto } from './dto/answer.dto';
import { ResumeDto } from './dto/resume.dto';
import { StandardAnswerDto } from './dto/standard-answer.dto';
import { initSse, sendSse, endSse } from '../common/sse';

@Controller('interview')
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  /** 流式创建新面试（SSE） */
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  @Post('start')
  @HttpCode(200)
  async startInterview(
    @Body() body: StartInterviewDto,
    @Res() res: Response,
  ) {
    initSse(res);
    try {
      let sessionId = '';
      for await (const { chunk, sessionId: sid } of this.interviewService.createSession(
        body.anonymousId,
        body.position,
        body.difficulty,
        body.totalQuestions ?? 5,
      )) {
        if (sid) sessionId = sid;
        sendSse(res, { type: 'chunk', content: chunk });
      }
      sendSse(res, { type: 'meta', sessionId, isOver: false });
    } catch (e: any) {
      sendSse(res, { type: 'error', message: e?.message ?? 'unknown error' });
    } finally {
      endSse(res);
    }
  }

  /** 流式回答（SSE） */
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  @Post('answer')
  @HttpCode(200)
  async answer(
    @Body() body: AnswerDto,
    @Res() res: Response,
  ) {
    initSse(res);
    try {
      let isOver = false;
      for await (const { chunk, isOver: over } of this.interviewService.answer(
        body.anonymousId,
        body.sessionId,
        body.answer,
      )) {
        isOver = over;
        sendSse(res, { type: 'chunk', content: chunk });
      }
      sendSse(res, { type: 'meta', isOver });
    } catch (e: any) {
      sendSse(res, { type: 'error', message: e?.message ?? 'unknown error' });
    } finally {
      endSse(res);
    }
  }

  /** 续玩流式（SSE） */
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  @Post('resume')
  @HttpCode(200)
  async resume(
    @Body() body: ResumeDto,
    @Res() res: Response,
  ) {
    initSse(res);
    try {
      let sessionId = '';
      let isOver = false;
      for await (const { chunk, sessionId: sid, isOver: over } of this.interviewService.resume(
        body.anonymousId,
        body.sessionId,
      )) {
        if (sid) sessionId = sid;
        isOver = over;
        sendSse(res, { type: 'chunk', content: chunk });
      }
      sendSse(res, { type: 'meta', sessionId, isOver });
    } catch (e: any) {
      sendSse(res, { type: 'error', message: e?.message ?? 'unknown error' });
    } finally {
      endSse(res);
    }
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
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.interviewService.getSession(anonymousId, sessionId);
  }

  /** 删除会话 */
  @Delete('session/:anonymousId/:sessionId')
  async deleteSession(
    @Param('anonymousId') anonymousId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.interviewService.deleteSession(anonymousId, sessionId);
  }

  /** 获取某个问题的标准答案（仅已结束的会话可用，优先返回缓存） */
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  @Post('standard-answer')
  async getStandardAnswer(@Body() body: StandardAnswerDto) {
    return this.interviewService.getStandardAnswer(
      body.anonymousId,
      body.sessionId,
      body.questionIndex,
      body.forceRegenerate,
    );
  }
}
