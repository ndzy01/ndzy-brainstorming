import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { UserService } from '../user/user.service';
import { GameSession } from '../entities/game-session.entity';
import { withSessionLockStream } from '../common/session-lock';
import {
  buildGameSystemPrompt,
  GAME_INTRO_PROMPT,
  buildActionContextPrompt,
  GAME_ENDING_PROMPT,
} from './prompts';

@Injectable()
export class GameService {
  constructor(
    private readonly ai: AiService,
    private readonly userService: UserService,
    @InjectRepository(GameSession)
    private readonly sessionRepo: Repository<GameSession>,
  ) {}

  /** 流式输出游戏开场白 */
  async *startGame(
    anonymousId: string,
    genre: string,
    style: string,
    maxTurns: number = 30,
  ): AsyncGenerator<{ chunk: string; sessionId: string; isOver: false }> {
    const user = await this.userService.findOrCreate(anonymousId);
    const systemPrompt = buildGameSystemPrompt(genre, style, maxTurns);

    const session = this.sessionRepo.create({
      genre,
      style,
      turn: 0,
      maxTurns,
      summary: '',
      messages: [{ role: 'system', content: systemPrompt }],
      isEnded: false,
      isProcessing: true,
      title: `${genre}·${style} - ${new Date().toLocaleDateString('zh-CN')}`,
      userId: user.id,
    });
    await this.sessionRepo.save(session);

    try {
      let intro = '';
      for await (const chunk of this.ai.askStream(
        GAME_INTRO_PROMPT,
        systemPrompt,
      )) {
        intro += chunk;
        yield { chunk, sessionId: session.id, isOver: false };
      }

      session.messages = [
        ...session.messages,
        { role: 'assistant', content: intro },
      ];
      session.turn = 1;
      session.summary = intro.slice(0, 500);
      session.isProcessing = false;
      await this.sessionRepo.save(session);
    } catch (e) {
      session.isProcessing = false;
      await this.sessionRepo.save(session);
      throw e;
    }
  }

  /** 玩家做出选择，流式返回 AI 续写 */
  playerAction(
    anonymousId: string,
    sessionId: string,
    action: string,
  ): AsyncGenerator<{ chunk: string; isOver: boolean }> {
    return withSessionLockStream(this.sessionRepo, sessionId, () =>
      this.playerActionInternal(anonymousId, sessionId, action),
    );
  }

  private async *playerActionInternal(
    _anonymousId: string,
    sessionId: string,
    action: string,
  ): AsyncGenerator<{ chunk: string; isOver: boolean }> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, isEnded: false },
    });
    if (!session) throw new NotFoundException('游戏会话不存在或已结束');

    session.messages = [
      ...session.messages,
      { role: 'user', content: `我的选择：${action}` },
    ];

    // 达到上限时自动生成结局
    const maxTurns = session.maxTurns || 30;
    const isFinalTurn = session.turn >= maxTurns;
    const contextPrompt = isFinalTurn
      ? GAME_ENDING_PROMPT
      : buildActionContextPrompt(session.turn, session.summary, maxTurns);
    const fullMessages = [
      ...session.messages,
      { role: 'user' as const, content: contextPrompt },
    ];

    let fullReply = '';
    for await (const chunk of this.ai.stream(fullMessages)) {
      fullReply += chunk;
      yield { chunk, isOver: isFinalTurn };
    }

    session.messages = [
      ...session.messages,
      { role: 'assistant', content: fullReply },
    ];
    session.turn += 1;
    session.summary = fullReply.slice(0, 800);
    if (isFinalTurn) session.isEnded = true;
    await this.sessionRepo.save(session);
  }

  /** 生成游戏结局 */
  endGame(
    anonymousId: string,
    sessionId: string,
  ): AsyncGenerator<{ chunk: string; isOver: true }> {
    return withSessionLockStream(this.sessionRepo, sessionId, () =>
      this.endGameInternal(anonymousId, sessionId),
    );
  }

  private async *endGameInternal(
    _anonymousId: string,
    sessionId: string,
  ): AsyncGenerator<{ chunk: string; isOver: true }> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, isEnded: false },
    });
    if (!session) throw new NotFoundException('游戏会话不存在或已结束');

    const fullMessages = [
      ...session.messages,
      { role: 'user' as const, content: GAME_ENDING_PROMPT },
    ];

    let fullReply = '';
    for await (const chunk of this.ai.stream(fullMessages)) {
      fullReply += chunk;
      yield { chunk, isOver: true };
    }

    session.messages = [
      ...session.messages,
      { role: 'assistant', content: fullReply },
    ];
    session.isEnded = true;
    await this.sessionRepo.save(session);
  }

  /** 续写中断的开场：仅当 session 没有 assistant 消息时有效 */
  async *resumeIntro(
    anonymousId: string,
    sessionId: string,
  ): AsyncGenerator<{ chunk: string; sessionId: string; isOver: false }> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('会话不存在');
    const user = await this.userService.findOrCreate(anonymousId);
    if (session.userId !== user.id) throw new NotFoundException('无权访问此会话');

    const hasAssistant = session.messages.some((m) => m.role === 'assistant');
    if (hasAssistant) return; // 已有内容，无需续写
    if (session.isEnded) throw new NotFoundException('游戏已结束');

    // 堆锁，避免重复 resume
    session.isProcessing = true;
    await this.sessionRepo.save(session);

    try {
      const systemMsg = session.messages.find((m) => m.role === 'system');
      const systemPrompt = systemMsg?.content ?? buildGameSystemPrompt(session.genre, session.style, session.maxTurns || 30);

      let intro = '';
      for await (const chunk of this.ai.askStream(GAME_INTRO_PROMPT, systemPrompt)) {
        intro += chunk;
        yield { chunk, sessionId: session.id, isOver: false };
      }

      session.messages = [
        ...session.messages,
        { role: 'assistant', content: intro },
      ];
      session.turn = 1;
      session.summary = intro.slice(0, 500);
      session.isProcessing = false;
      await this.sessionRepo.save(session);
    } catch (e) {
      session.isProcessing = false;
      await this.sessionRepo.save(session);
      throw e;
    }
  }

  /** 获取历史列表 */
  async getHistory(anonymousId: string) {
    const user = await this.userService.findOrCreate(anonymousId);
    return this.sessionRepo.find({
      where: { userId: user.id },
      order: { updatedAt: 'DESC' },
      select: {
        id: true,
        genre: true,
        style: true,
        turn: true,
        maxTurns: true,
        isEnded: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** 获取单个会话详情（续玩或阅读） */
  async getSession(anonymousId: string, sessionId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('会话不存在');

    const user = await this.userService.findOrCreate(anonymousId);
    if (session.userId !== user.id)
      throw new NotFoundException('无权访问此会话');

    return {
      ...session,
      messages: session.messages.filter((m) => m.role !== 'system'),
    };
  }

  /** 删除会话 */
  async deleteSession(anonymousId: string, sessionId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('会话不存在');

    const user = await this.userService.findOrCreate(anonymousId);
    if (session.userId !== user.id)
      throw new NotFoundException('无权删除此会话');

    await this.sessionRepo.remove(session);
    return { deleted: true };
  }
}
