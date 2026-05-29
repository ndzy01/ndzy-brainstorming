import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { UserService } from '../user/user.service';
import { GameSession } from '../entities/game-session.entity';
import type { ChatMessage } from '../entities/game-session.entity';

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
  ): AsyncGenerator<{
    chunk: string;
    sessionId: string;
    isOver: false;
  }> {
    const user = await this.userService.findOrCreate(anonymousId);
    const systemPrompt = this.buildGamePrompt(genre, style);

    const session = this.sessionRepo.create({
      genre,
      style,
      turn: 0,
      summary: '',
      messages: [{ role: 'system', content: systemPrompt }],
      isEnded: false,
      title: `${genre}·${style} - ${new Date().toLocaleDateString('zh-CN')}`,
      userId: user.id,
    });
    await this.sessionRepo.save(session);

    let intro = '';
    for await (const chunk of this.ai.askStream(
      '游戏开始了！请用生动的文笔写出开场剧情，设定世界观、主角身份、当前处境。在末尾给出2-3个清晰的行动选项让玩家选择（用数字编号）。直接输出故事正文，不需要额外解释。',
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
    await this.sessionRepo.save(session);
  }

  /** 玩家做出选择，流式返回 AI 续写 */
  async *playerAction(
    anonymousId: string,
    sessionId: string,
    action: string,
  ): AsyncGenerator<{
    chunk: string;
    isOver: boolean;
  }> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, isEnded: false },
    });
    if (!session) throw new NotFoundException('游戏会话不存在或已结束');

    session.messages = [
      ...session.messages,
      { role: 'user', content: `我的选择：${action}` },
    ];

    const systemContext = `这是第 ${session.turn} 回合。

近期剧情摘要：${session.summary}

请根据玩家的选择继续推进剧情。要求：
1. 描述玩家的行动带来的结果和发展的新剧情
2. 保持故事连贯，与之前的剧情衔接
3. 在末尾给出新的2-3个行动选项（数字编号）
4. 故事要有起伏、悬念或冲突

直接输出故事正文，不要额外解释。`;

    const fullMessages = [
      ...session.messages,
      { role: 'user' as const, content: systemContext },
    ];

    let fullReply = '';
    for await (const chunk of this.ai.stream(fullMessages)) {
      fullReply += chunk;
      yield { chunk, isOver: false };
    }

    session.messages = [
      ...session.messages,
      { role: 'assistant', content: fullReply },
    ];
    session.turn += 1;
    session.summary = fullReply.slice(0, 800);
    await this.sessionRepo.save(session);
  }

  /** 生成游戏结局 */
  async *endGame(
    anonymousId: string,
    sessionId: string,
  ): AsyncGenerator<{
    chunk: string;
    isOver: true;
  }> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, isEnded: false },
    });
    if (!session) throw new NotFoundException('游戏会话不存在或已结束');

    const prompt =
      '游戏即将结束。请根据整个故事的发展，写一个精彩的结局。回顾主角的旅程，给故事一个合适的收尾。结局应该让玩家感到满足。用中文输出。';

    const fullMessages = [
      ...session.messages,
      { role: 'user' as const, content: prompt },
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

  private buildGamePrompt(genre: string, style: string): string {
    return `你是一个专业的互动小说叙述者。你正在主持一个${genre}类型的互动故事游戏。

写作风格：${style}

游戏规则：
1. 每回合描述剧情发展后，必须给出2-3个清晰的行动选项供玩家选择
2. 选项用数字编号（1. 2. 3.），每个选项一行
3. 剧情要有分支感，不同选择导向不同发展
4. 保持故事连贯、人物一致、世界观自洽
5. 文字生动有画面感，适度使用环境描写和对话
6. 主角就是玩家，用第二人称"你"来叙事
7. 这是一个安全的、适合所有人的故事，避免极端暴力或不当内容
8. 每回合字数控制在200-500字之间（不含选项）

你是一个富有创意的故事讲述者，让玩家沉浸在你的故事中吧！`;
  }
}