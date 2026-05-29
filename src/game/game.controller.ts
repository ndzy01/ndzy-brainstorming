import { Controller, Post, Body, Res, Get, Param, Delete } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { GameService } from './game.service';
import { StartGameDto } from './dto/start.dto';
import { PlayerActionDto } from './dto/action.dto';
import { EndGameDto } from './dto/end.dto';
import { initSse, sendSse, endSse } from '../common/sse';

@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  /** 流式开始新游戏（SSE） */
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  @Post('start')
  async startGame(
    @Body() body: StartGameDto,
    @Res() res: Response,
  ) {
    initSse(res);
    try {
      let sessionId = '';
      for await (const { chunk, sessionId: sid } of this.gameService.startGame(
        body.anonymousId,
        body.genre,
        body.style,
      )) {
        if (sid) sessionId = sid;
        sendSse(res, { type: 'chunk', content: chunk });
      }
      sendSse(res, { type: 'meta', sessionId });
    } catch (e: any) {
      sendSse(res, { type: 'error', message: e?.message ?? 'unknown error' });
    } finally {
      endSse(res);
    }
  }

  /** 玩家行动（SSE） */
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  @Post('action')
  async playerAction(
    @Body() body: PlayerActionDto,
    @Res() res: Response,
  ) {
    initSse(res);
    try {
      for await (const { chunk } of this.gameService.playerAction(
        body.anonymousId,
        body.sessionId,
        body.action,
      )) {
        sendSse(res, { type: 'chunk', content: chunk });
      }
    } catch (e: any) {
      sendSse(res, { type: 'error', message: e?.message ?? 'unknown error' });
    } finally {
      endSse(res);
    }
  }

  /** 结束游戏（SSE） */
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  @Post('end')
  async endGame(
    @Body() body: EndGameDto,
    @Res() res: Response,
  ) {
    initSse(res);
    try {
      for await (const { chunk } of this.gameService.endGame(
        body.anonymousId,
        body.sessionId,
      )) {
        sendSse(res, { type: 'chunk', content: chunk });
      }
    } catch (e: any) {
      sendSse(res, { type: 'error', message: e?.message ?? 'unknown error' });
    } finally {
      endSse(res);
    }
  }

  /** 获取历史列表 */
  @Get('history/:anonymousId')
  async getHistory(@Param('anonymousId') anonymousId: string) {
    return this.gameService.getHistory(anonymousId);
  }

  /** 获取单个会话详情 */
  @Get('session/:anonymousId/:sessionId')
  async getSession(
    @Param('anonymousId') anonymousId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.gameService.getSession(anonymousId, sessionId);
  }

  /** 删除会话 */
  @Delete('session/:anonymousId/:sessionId')
  async deleteSession(
    @Param('anonymousId') anonymousId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.gameService.deleteSession(anonymousId, sessionId);
  }
}
