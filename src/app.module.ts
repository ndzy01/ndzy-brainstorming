import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from './ai/ai.module';
import { UserModule } from './user/user.module';
import { InterviewModule } from './interview/interview.module';
import { GameModule } from './game/game.module';
import { User } from './entities/user.entity';
import { InterviewSession } from './entities/interview-session.entity';
import { GameSession } from './entities/game-session.entity';

const imports: any[] = [
  AiModule,
  UserModule,
  InterviewModule,
  GameModule,
  TypeOrmModule.forRoot({
    type: 'postgres',
    port: 5432,
    host: process.env.DB_HOST,
    username: 'neondb_owner',
    password: process.env.DB_PASSWORD,
    database: 'neondb',
    ssl: true,
    entities: [User, InterviewSession, GameSession],
    synchronize: true,
  }),
];

// 生产环境 serve 前端构建产物
if (process.env.NODE_ENV === 'production') {
  imports.unshift(
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client', 'dist'),
      exclude: ['/api*'],
    }),
  );
}

@Module({ imports })
export class AppModule {}
