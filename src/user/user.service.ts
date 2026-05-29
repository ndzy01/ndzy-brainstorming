import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /** 根据匿名 ID 查找或创建用户 */
  async findOrCreate(anonymousId: string): Promise<User> {
    let user = await this.userRepo.findOne({ where: { anonymousId } });
    if (!user) {
      user = this.userRepo.create({ anonymousId });
      await this.userRepo.save(user);
    }
    return user;
  }
}