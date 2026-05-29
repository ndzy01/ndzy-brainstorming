import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { UserService } from '../user/user.service';
import { InterviewSession } from '../entities/interview-session.entity';
import { withSessionLockStream } from '../common/session-lock';
import {
  buildInterviewSystemPrompt,
  INTERVIEW_GREETING_PROMPT,
  buildNextQuestionPrompt,
  buildResumePrompt,
  INTERVIEW_REPORT_PROMPT,
  buildStandardAnswerPrompt,
} from './prompts';

@Injectable()
export class InterviewService {
  constructor(
    private readonly ai: AiService,
    private readonly userService: UserService,
    @InjectRepository(InterviewSession)
    private readonly sessionRepo: Repository<InterviewSession>,
  ) {}

  /** 创建新面试会话并流式返回开场白 */
  async *createSession(
    anonymousId: string,
    position: string,
    difficulty: string,
    totalQuestions: number = 5,
  ): AsyncGenerator<{
    chunk: string;
    sessionId: string;
    isOver: false;
  }> {
    const user = await this.userService.findOrCreate(anonymousId);
    const systemPrompt = buildInterviewSystemPrompt(position, difficulty);

    const session = this.sessionRepo.create({
      position,
      difficulty,
      totalQuestions,
      currentQuestion: 0,
      messages: [{ role: 'system', content: systemPrompt }],
      isCompleted: false,
      isProcessing: true, // 创建时直接占有锁
      title: `${position} - ${difficulty} - ${new Date().toLocaleDateString('zh-CN')}`,
      userId: user.id,
    });
    await this.sessionRepo.save(session);

    try {
      let greeting = '';
      for await (const chunk of this.ai.askStream(
        INTERVIEW_GREETING_PROMPT,
        systemPrompt,
      )) {
        greeting += chunk;
        yield { chunk, sessionId: session.id, isOver: false };
      }

      session.messages = [
        ...session.messages,
        { role: 'assistant', content: greeting },
      ];
      session.currentQuestion = 1;
      session.isProcessing = false;
      await this.sessionRepo.save(session);
    } catch (e) {
      session.isProcessing = false;
      await this.sessionRepo.save(session);
      throw e;
    }
  }

  /** 候选人回答，流式返回 AI 反馈 */
  answer(
    anonymousId: string,
    sessionId: string,
    userAnswer: string,
  ): AsyncGenerator<{
    chunk: string;
    isOver: boolean;
  }> {
    return withSessionLockStream(this.sessionRepo, sessionId, () =>
      this.answerInternal(anonymousId, sessionId, userAnswer),
    );
  }

  private async *answerInternal(
    _anonymousId: string,
    sessionId: string,
    userAnswer: string,
  ): AsyncGenerator<{ chunk: string; isOver: boolean }> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, isCompleted: false },
    });
    if (!session) throw new NotFoundException('会话不存在或已结束');

    session.messages = [
      ...session.messages,
      { role: 'user', content: userAnswer },
    ];

    let prompt: string;
    let isOver = false;

    if (session.currentQuestion >= session.totalQuestions) {
      prompt = INTERVIEW_REPORT_PROMPT;
      isOver = true;
    } else {
      prompt = buildNextQuestionPrompt(
        session.currentQuestion + 1,
        session.totalQuestions,
      );
    }

    const fullMessages = [
      ...session.messages,
      { role: 'user' as const, content: prompt },
    ];

    let fullReply = '';
    for await (const chunk of this.ai.stream(fullMessages)) {
      fullReply += chunk;
      yield { chunk, isOver };
    }

    session.messages = [
      ...session.messages,
      { role: 'assistant', content: fullReply },
    ];

    if (isOver) {
      session.isCompleted = true;
      session.report = fullReply;
    } else {
      session.currentQuestion += 1;
    }
    await this.sessionRepo.save(session);
  }

  /** 获取用户的历史会话列表 */
  async getHistory(anonymousId: string) {
    const user = await this.userService.findOrCreate(anonymousId);
    return this.sessionRepo.find({
      where: { userId: user.id },
      order: { updatedAt: 'DESC' },
      select: {
        id: true,
        position: true,
        difficulty: true,
        totalQuestions: true,
        currentQuestion: true,
        isCompleted: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** 获取单个会话详情（用于续玩或查看） */
  async getSession(anonymousId: string, sessionId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('会话不存在');

    // 验证所有权
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

  /** 获取已结束面试中某个问题的标准答案（优先走缓存） */
  async getStandardAnswer(
    anonymousId: string,
    sessionId: string,
    questionIndex: number,
    forceRegenerate?: boolean,
  ): Promise<{ answer: string; cached: boolean }> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, isCompleted: true },
    });
    if (!session) throw new NotFoundException('会话不存在或未结束');

    const user = await this.userService.findOrCreate(anonymousId);
    if (session.userId !== user.id)
      throw new NotFoundException('无权访问此会话');

    const cacheKey = String(questionIndex);
    const cachedAnswers: Record<string, string> =
      (session.standardAnswers as Record<string, string>) ?? {};

    if (!forceRegenerate && cachedAnswers[cacheKey]) {
      return { answer: cachedAnswers[cacheKey], cached: true };
    }

    const assistantMsgs = session.messages.filter(
      (m) => m.role === 'assistant',
    );
    const question = assistantMsgs[questionIndex];
    if (!question) throw new NotFoundException('问题不存在');

    const answer = await this.ai.ask(
      buildStandardAnswerPrompt(question.content),
    );

    cachedAnswers[cacheKey] = answer;
    session.standardAnswers = cachedAnswers;
    await this.sessionRepo.save(session);

    return { answer, cached: false };
  }

  /** 续玩：从断点继续面试 */
  resume(
    anonymousId: string,
    sessionId: string,
  ): AsyncGenerator<{ chunk: string; sessionId: string; isOver: boolean }> {
    return withSessionLockStream(this.sessionRepo, sessionId, () =>
      this.resumeInternal(anonymousId, sessionId),
    );
  }

  private async *resumeInternal(
    anonymousId: string,
    sessionId: string,
  ): AsyncGenerator<{ chunk: string; sessionId: string; isOver: boolean }> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, isCompleted: false },
    });
    if (!session) throw new NotFoundException('会话不存在或已结束');

    const user = await this.userService.findOrCreate(anonymousId);
    if (session.userId !== user.id)
      throw new NotFoundException('无权访问此会话');

    let prompt: string;
    let isOver = false;

    if (session.currentQuestion >= session.totalQuestions) {
      prompt = INTERVIEW_REPORT_PROMPT;
      isOver = true;
    } else {
      prompt = buildResumePrompt(
        session.currentQuestion + 1,
        session.totalQuestions,
      );
    }

    const fullMessages = [
      ...session.messages,
      { role: 'user' as const, content: prompt },
    ];

    let fullReply = '';
    for await (const chunk of this.ai.stream(fullMessages)) {
      fullReply += chunk;
      yield { chunk, sessionId: session.id, isOver };
    }

    session.messages = [
      ...session.messages,
      { role: 'assistant', content: fullReply },
    ];

    if (isOver) {
      session.isCompleted = true;
      session.report = fullReply;
    } else {
      session.currentQuestion += 1;
    }
    await this.sessionRepo.save(session);
  }
}
