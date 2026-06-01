import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Entity('interview_sessions')
export class InterviewSession {
  /** 会话唯一标识（UUID） */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 面试岗位，如：前端开发、后端开发、产品经理 */
  @Column({ length: 64 })
  position: string;

  /** 面试难度：初级 / 中级 / 高级 */
  @Column({ length: 16 })
  difficulty: string;

  /** 预设的总题数 */
  @Column({ type: 'int', default: 5 })
  totalQuestions: number;

  /** 当前已完成的题号（从 0 开始计数） */
  @Column({ type: 'int', default: 0 })
  currentQuestion: number;

  /** 完整的消息历史，包含面试官提问和候选人回答 */
  @Column({ type: 'json', default: '[]' })
  messages: ChatMessage[];

  /** 面试是否已完成 */
  @Column({ default: false })
  isCompleted: boolean;

  /** 是否有请求正在处理中（并发锁） */
  @Column({ default: false })
  isProcessing: boolean;

  /** AI 生成的面试表现评估报告 */
  @Column({ type: 'text', nullable: true })
  report: string | null;

  /** 每题标准答案缓存，JSON 对象 { "0": "答案1", "1": "答案2" }，null 表示无缓存 */
  @Column({ type: 'json', nullable: true })
  standardAnswers: Record<string, string> | null;

  /** 会话标题，便于在历史列表中识别 */
  @Column({ type: 'varchar', length: 128, nullable: true })
  title: string | null;

  /** 会话创建时间 */
  @CreateDateColumn()
  createdAt: Date;

  /** 最近更新时间 */
  @UpdateDateColumn()
  updatedAt: Date;

  /** 所属用户 */
  @ManyToOne(() => User, (user) => user.interviewSessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** 关联的用户 ID */
  @Column()
  userId: string;
}
