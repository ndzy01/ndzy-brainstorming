import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
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
