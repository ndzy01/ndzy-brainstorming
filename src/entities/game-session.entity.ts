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
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64 })
  genre: string;

  @Column({ length: 64 })
  style: string;

  @Column({ type: 'int', default: 0 })
  turn: number;

  @Column({ length: 1024, default: '' })
  summary: string;

  @Column({ type: 'json', default: '[]' })
  messages: ChatMessage[];

  @Column({ default: false })
  isEnded: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  title: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.gameSessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;
}