import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from './ai/ai.module';
import { UserModule } from './user/user.module';
import { InterviewModule } from './interview/interview.module';
import { GameModule } from './game/game.module';
import { User } from './entities/user.entity';
import { InterviewSession } from './entities/interview-session.entity';
import { GameSession } from './entities/game-session.entity';

@Module({
  imports: [
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
  ],
})
export class AppModule {}