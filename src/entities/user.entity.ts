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
  /** 用户唯一标识（UUID） */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 匿名用户标识，用于免登录识别用户身份 */
  @Column({ unique: true, length: 64 })
  anonymousId: string;

  /** 首次访问时间 */
  @CreateDateColumn()
  createdAt: Date;

  /** 最近活跃时间 */
  @UpdateDateColumn()
  updatedAt: Date;

  /** 该用户的所有面试会话 */
  @OneToMany(() => InterviewSession, (s) => s.user)
  interviewSessions: InterviewSession[];

  /** 该用户的所有文字游戏会话 */
  @OneToMany(() => GameSession, (s) => s.user)
  gameSessions: GameSession[];
}
