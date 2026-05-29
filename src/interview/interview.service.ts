import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { UserService } from '../user/user.service';
import { InterviewSession } from '../entities/interview-session.entity';
import type { ChatMessage } from '../entities/interview-session.entity';

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
    const systemPrompt = this.buildSystemPrompt(position, difficulty);

    const session = this.sessionRepo.create({
      position,
      difficulty,
      totalQuestions,
      currentQuestion: 0,
      messages: [{ role: 'system', content: systemPrompt }],
      isCompleted: false,
      title: `${position} - ${difficulty} - ${new Date().toLocaleDateString('zh-CN')}`,
      userId: user.id,
    });
    await this.sessionRepo.save(session);

    let greeting = '';
    for await (const chunk of this.ai.askStream(
      '请用中文向候选人打招呼，介绍你是面试官，并开始第一个面试问题。直接输出你的发言，不要加解释。',
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
    await this.sessionRepo.save(session);
  }

  /** 候选人回答，流式返回 AI 反馈 */
  async *answer(
    anonymousId: string,
    sessionId: string,
    userAnswer: string,
  ): AsyncGenerator<{
    chunk: string;
    isOver: boolean;
  }> {
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
      prompt =
        '面试已结束。请根据候选人的全部回答，给出综合评价报告。\n' +
        '一、优点\n二、待改进项\n三、技术能力评分(1-10)\n四、沟通能力评分(1-10)\n五、总体评分(1-10)\n六、学习建议\n' +
        '七、标准答案：针对每个面试问题，给出该问题的理想回答要点或参考答案，帮助候选人理解面试官期望的回答方向。\n' +
        '用中文输出结构性报告，使用 Markdown 格式。';
      isOver = true;
    } else {
      prompt = `这是第 ${session.currentQuestion + 1}/${session.totalQuestions} 个问题。请对候选人刚才的回答给出一两句简短反馈，然后提出下一个面试问题。用中文。`;
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
      messages: session.messages.filter(
        (m) => m.role !== 'system',
      ),
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
    const cachedAnswers: Record<string, string> = (session.standardAnswers as Record<string, string>) ?? {};

    // 非强制重新生成时，优先返回缓存
    if (!forceRegenerate && cachedAnswers[cacheKey]) {
      return { answer: cachedAnswers[cacheKey], cached: true };
    }

    const assistantMsgs = session.messages.filter((m) => m.role === 'assistant');
    const question = assistantMsgs[questionIndex];
    if (!question) throw new NotFoundException('问题不存在');

    const prompt = `你是一位资深技术面试官。以下是你在面试中提出的一个问题，请给出该问题的标准答案或理想回答要点（用中文，简明扼要）：\n\n【面试问题】\n${question.content}\n\n【标准答案/参考要点】`;
    const answer = await this.ai.ask(prompt);

    // 写入缓存
    cachedAnswers[cacheKey] = answer;
    session.standardAnswers = cachedAnswers;
    await this.sessionRepo.save(session);

    return { answer, cached: false };
  }

  /** 续玩：从断点继续面试（传入现有 session，流式返回下一题或报告） */
  async *resume(
    anonymousId: string,
    sessionId: string,
  ): AsyncGenerator<{
    chunk: string;
    sessionId: string;
    isOver: boolean;
  }> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, isCompleted: false },
    });
    if (!session) throw new NotFoundException('会话不存在或已结束');

    const user = await this.userService.findOrCreate(anonymousId);
    if (session.userId !== user.id)
      throw new NotFoundException('无权访问此会话');

    // 边界保护：如果所有题目已完成，直接走报告生成
    let prompt: string;
    let isOver = false;

    if (session.currentQuestion >= session.totalQuestions) {
      prompt =
        '面试已结束。请根据候选人的全部回答，给出综合评价报告。\n' +
        '一、优点\n二、待改进项\n三、技术能力评分(1-10)\n四、沟通能力评分(1-10)\n五、总体评分(1-10)\n六、学习建议\n' +
        '七、标准答案：针对每个面试问题，给出该问题的理想回答要点或参考答案，帮助候选人理解面试官期望的回答方向。\n' +
        '用中文输出结构性报告，使用 Markdown 格式。';
      isOver = true;
    } else {
      prompt = `继续之前的面试。请先简短回顾上一题并过渡，然后提出第 ${session.currentQuestion + 1}/${session.totalQuestions} 个问题。用中文。`;
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

  private buildSystemPrompt(position: string, difficulty: string): string {
    return `你是一位资深技术面试官，正在面试一位${position}岗位的候选人。面试难度为${difficulty}。

面试规则：
1. 每次只问一个问题，根据候选人回答给出简短反馈后再问下一个
2. 问题应该覆盖：基础知识、项目经验、系统设计（按难度调整比例）
3. 根据候选人的回答水平动态调整后续问题的深度
4. 难度等级说明：
   - 初级(1-3年)：侧重基础语法、常用框架、简单算法
   - 中级(3-5年)：侧重系统设计、性能优化、项目架构
   - 高级(5年+)：侧重架构设计、技术决策、团队领导
5. 面试结束后给出详细的评价报告
6. 全程用中文交流，保持专业友好的语气`;
  }
}