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
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64 })
  position: string;

  @Column({ length: 16 })
  difficulty: string;

  @Column({ type: 'int', default: 5 })
  totalQuestions: number;

  @Column({ type: 'int', default: 0 })
  currentQuestion: number;

  @Column({ type: 'json', default: '[]' })
  messages: ChatMessage[];

  @Column({ default: false })
  isCompleted: boolean;

  @Column({ type: 'text', nullable: true })
  report: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  title: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.interviewSessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;
}