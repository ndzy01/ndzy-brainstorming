import { Controller, Post, Body, Res, Get, Param, Delete } from '@nestjs/common';
import type { Response } from 'express';
import { GameService } from './game.service';
import { StartGameDto } from './dto/start.dto';
import { PlayerActionDto } from './dto/action.dto';
import { EndGameDto } from './dto/end.dto';

@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  /** 流式开始新游戏 */
  @Post('start')
  async startGame(
    @Body() body: StartGameDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    let sessionId = '';
    for await (const { chunk, sessionId: sid } of this.gameService.startGame(
      body.anonymousId,
      body.genre,
      body.style,
    )) {
      if (sid) sessionId = sid;
      res.write(chunk);
    }
    res.write(`\n<!--SESSION_ID:${sessionId}-->`);
    res.end();
  }

  /** 玩家行动 */
  @Post('action')
  async playerAction(
    @Body() body: PlayerActionDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const { chunk } of this.gameService.playerAction(
      body.anonymousId,
      body.sessionId,
      body.action,
    )) {
      res.write(chunk);
    }
    res.end();
  }

  /** 结束游戏 */
  @Post('end')
  async endGame(
    @Body() body: EndGameDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const { chunk } of this.gameService.endGame(
      body.anonymousId,
      body.sessionId,
    )) {
      res.write(chunk);
    }
    res.end();
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
