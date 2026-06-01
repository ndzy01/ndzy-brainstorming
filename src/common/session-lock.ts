import { ConflictException } from '@nestjs/common';
import { Repository, ObjectLiteral } from 'typeorm';

/**
 * 抢占式会话锁：基于 SQL 原子更新实现，防止同一会话被并发处理。
 *
 * 使用方式：
 *   await withSessionLock(repo, sessionId, async () => {
 *     // 临界区
 *   });
 *
 * 如果已被其他请求占用，会立即抛 ConflictException，避免无意义的 AI 调用。
 */
export async function withSessionLock<
  T extends ObjectLiteral & { id: string; isProcessing: boolean },
  R,
>(
  repo: Repository<T>,
  sessionId: string,
  fn: () => Promise<R> | AsyncGenerator<R>,
): Promise<R> {
  // 原子尝试加锁：只有当 isProcessing=false 时才更新为 true
  const acquired = await repo
    .createQueryBuilder()
    .update()
    .set({ isProcessing: true } as any)
    .where('id = :id AND "isProcessing" = false', { id: sessionId })
    .execute();

  if (!acquired.affected) {
    throw new ConflictException('该会话正在处理中，请稍后再试');
  }

  try {
    const result = await (fn() as Promise<R>);
    return result;
  } finally {
    // 解锁（即使失败也释放）
    await repo
      .createQueryBuilder()
      .update()
      .set({ isProcessing: false } as any)
      .where('id = :id', { id: sessionId })
      .execute();
  }
}

/**
 * 生成器版本：用于流式接口，包装 AsyncGenerator
 */
export async function* withSessionLockStream<
  T extends ObjectLiteral & { id: string; isProcessing: boolean },
  Y,
>(
  repo: Repository<T>,
  sessionId: string,
  gen: () => AsyncGenerator<Y>,
): AsyncGenerator<Y> {
  const acquired = await repo
    .createQueryBuilder()
    .update()
    .set({ isProcessing: true } as any)
    .where('id = :id AND "isProcessing" = false', { id: sessionId })
    .execute();

  if (!acquired.affected) {
    throw new ConflictException('该会话正在处理中，请稍后再试');
  }

  try {
    yield* gen();
  } finally {
    await repo
      .createQueryBuilder()
      .update()
      .set({ isProcessing: false } as any)
      .where('id = :id', { id: sessionId })
      .execute();
  }
}
