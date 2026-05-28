import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    AiModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      port: 5432,
      host: process.env.DB_HOST,
      username: 'neondb_owner',
      password: process.env.DB_PASSWORD,
      database: 'neondb',
      ssl: true,
      entities: [],
      synchronize: true,
    }),
  ],
})
export class AppModule {}
