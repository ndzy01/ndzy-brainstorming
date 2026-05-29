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

@Entity('game_sessions')
export class GameSession {
  /** 会话唯一标识（UUID） */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 游戏题材，如：武侠、科幻、都市 */
  @Column({ length: 64 })
  genre: string;

  /** 游戏风格，如：悬疑、热血、轻松 */
  @Column({ length: 64 })
  style: string;

  /** 当前回合数 */
  @Column({ type: 'int', default: 0 })
  turn: number;

  /** 当前剧情的简要摘要 */
  @Column({ length: 1024, default: '' })
  summary: string;

  /** 完整的消息历史，包含 system/user/assistant 多轮对话 */
  @Column({ type: 'json', default: '[]' })
  messages: ChatMessage[];

  /** 游戏是否已结束 */
  @Column({ default: false })
  isEnded: boolean;

  /** 是否有请求正在处理中（并发锁） */
  @Column({ default: false })
  isProcessing: boolean;

  /** 会话标题，由 AI 自动生成或用户手动设置 */
  @Column({ type: 'varchar', length: 128, nullable: true })
  title: string | null;

  /** 会话创建时间 */
  @CreateDateColumn()
  createdAt: Date;

  /** 最近更新时间 */
  @UpdateDateColumn()
  updatedAt: Date;

  /** 所属用户 */
  @ManyToOne(() => User, (user) => user.gameSessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** 关联的用户 ID */
  @Column()
  userId: string;
}
