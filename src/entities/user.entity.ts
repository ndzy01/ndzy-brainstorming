import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { InterviewSession } from './interview-session.entity';
import { GameSession } from './game-session.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 64 })
  anonymousId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => InterviewSession, (s) => s.user)
  interviewSessions: InterviewSession[];

  @OneToMany(() => GameSession, (s) => s.user)
  gameSessions: GameSession[];
}