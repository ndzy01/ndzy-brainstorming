/**
 * 后端 SSE 事件类型，与 server/src/common/sse.ts 保持一致
 */
export type SseEvent =
  | { type: 'chunk'; content: string }
  | { type: 'meta'; sessionId?: string; isOver?: boolean }
  | { type: 'error'; message: string }
  | { type: 'done' };

/**
 * 以 POST + SSE 方式请求，逐事件 yield。
 * 浏览器原生 EventSource 只支持 GET，所以这里用 fetch + 手动解析。
 */
export async function* postSse(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    if (res.status === 429) {
      yield { type: 'error', message: '请求过于频繁，请稍后再试' };
      return;
    }
    yield { type: 'error', message: `请求失败 (${res.status})` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 事件以 \n\n 分隔
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      // 提取所有 data: 行并拼接（SSE 规范允许多行）
      const dataLines = raw
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart());
      if (dataLines.length === 0) continue;

      const payload = dataLines.join('\n');
      try {
        yield JSON.parse(payload) as SseEvent;
      } catch {
        // 忽略无法解析的 payload
      }
    }
  }
}
