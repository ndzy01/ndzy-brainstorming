import type { Response } from 'express';

/**
 * SSE 事件统一类型：
 * - chunk: 流式内容片段
 * - meta:  元信息（sessionId / isOver 等）
 * - error: 错误信息
 * - done:  流结束
 */
export type SseEvent =
  | { type: 'chunk'; content: string }
  | { type: 'meta'; sessionId?: string; isOver?: boolean }
  | { type: 'error'; message: string }
  | { type: 'done' };

/** 初始化 SSE 响应头 */
export function initSse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

/** 发送一个 SSE 事件 */
export function sendSse(res: Response, event: SseEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/** 结束 SSE 流 */
export function endSse(res: Response): void {
  sendSse(res, { type: 'done' });
  res.end();
}
