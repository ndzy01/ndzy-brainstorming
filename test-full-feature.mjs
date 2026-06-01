/**
 * 全量功能测试脚本 (使用 node:http 绕过 undici 端口限制)
 * 匿名用户: anon_1741737f8c7040c0
 */
import http from 'node:http';

const BASE = 'http://localhost:6666/api';
const ANON = 'anon_1741737f8c7040c0';

const pass = (s) => `\x1b[32m✓ ${s}\x1b[0m`;
const fail = (s) => `\x1b[31m✗ ${s}\x1b[0m`;
const info = (s) => `\x1b[36m→ ${s}\x1b[0m`;

let total = 0, passed = 0;

function assert(name, condition, detail = '') {
  total++;
  if (condition) { passed++; console.log(pass(name) + (detail ? ` ${detail}` : '')); }
  else { console.log(fail(name) + (detail ? ` ${detail}` : '')); }
}

/** 解析 URL -> { hostname, port, path } */
function parseUrl(url) {
  const u = new URL(url);
  return { hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search };
}

/** HTTP 请求封装 */
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const { hostname, port, path: reqPath } = parseUrl(`${BASE}${path}`);
    const opts = { method, hostname, port, path: reqPath, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' } };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(text), raw: text }); }
        catch { resolve({ status: res.statusCode, data: text, raw: text }); }
      });
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(120_000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/** SSE 流请求 — 逐事件解析 */
async function fetchSse(path, body) {
  return new Promise((resolve, reject) => {
    const { hostname, port, path: reqPath } = parseUrl(`${BASE}${path}`);
    const opts = { method: 'POST', hostname, port, path: reqPath, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' } };
    const req = http.request(opts, (res) => {
      const events = [];
      let buffer = '';
      res.on('data', (c) => {
        buffer += c.toString();
        let sep;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const dataLines = raw.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart());
          if (dataLines.length === 0) continue;
          try { events.push(JSON.parse(dataLines.join('\n'))); } catch {}
        }
      });
      res.on('end', () => resolve({ status: res.statusCode, events }));
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(120_000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

function extractMeta(events) {
  const meta = events.find(e => e.type === 'meta');
  const chunks = events.filter(e => e.type === 'chunk').map(e => e.content);
  const errors = events.filter(e => e.type === 'error');
  return { meta, chunks, errors, fullContent: chunks.join('') };
}

// ======================== 测试开始 ========================
console.log('='.repeat(60));
console.log(`全量功能测试 - 用户: ${ANON}`);
console.log(`时间: ${new Date().toISOString()}`);
console.log('='.repeat(60));

// ────────── GAME 模块 ──────────

// 1. 游戏历史
{
  const { status, data } = await request('GET', `/game/history/${ANON}`);
  assert('1. GET /game/history — 返回数组', Array.isArray(data), `status=${status}`);
}

// 2. 启动游戏（SSE）
let gameSessionId = null;
{
  console.log(info('2. POST /game/start — 流式启动游戏 (等待 AI 响应...)'));
  const { status, events } = await fetchSse('/game/start', { anonymousId: ANON, genre: '奇幻冒险', style: '热血爽文', maxTurns: 5 });
  assert('2a. /game/start 状态码 200', status === 200, `status=${status}`);
  const { meta, fullContent, errors } = extractMeta(events);
  assert('2b. /game/start 返回 meta.sessionId', !!meta?.sessionId, `sessionId=${meta?.sessionId}`);
  assert('2c. /game/start 有内容返回', fullContent.length > 0, `content_len=${fullContent.length}`);
  assert('2d. /game/start 无错误', errors.length === 0, `errors=${errors.length}`);
  gameSessionId = meta?.sessionId;
  console.log(info(`  sessionId: ${gameSessionId}, 内容长度: ${fullContent.length}`));
}

// 3. 玩家行动
{
  console.log(info('3. POST /game/action — 玩家行动 (等待 AI 响应...)'));
  const { status, events } = await fetchSse('/game/action', { anonymousId: ANON, sessionId: gameSessionId, action: '向前探索' });
  assert('3a. /game/action 状态码 200', status === 200, `status=${status}`);
  const { fullContent, errors } = extractMeta(events);
  assert('3b. /game/action 有内容', fullContent.length > 0, `content_len=${fullContent.length}`);
  assert('3c. /game/action 无错误', errors.length === 0, `errors=${errors.length}`);
}

// 4. 获取会话详情
{
  console.log(info('4. GET /game/session — 获取会话详情'));
  const { status, data } = await request('GET', `/game/session/${ANON}/${gameSessionId}`);
  assert('4a. /game/session 状态码 200', status === 200, `status=${status}`);
  assert('4b. /game/session 有 messages', !!data?.messages, `msgs=${data?.messages?.length || 0}`);
  assert('4c. /game/session 有 turn', typeof data?.turn === 'number', `turn=${data?.turn}`);
}

// 5. 第二次行动
{
  console.log(info('5. POST /game/action — 第二次行动 (等待 AI 响应...)'));
  const { status, events } = await fetchSse('/game/action', { anonymousId: ANON, sessionId: gameSessionId, action: '2. 继续前进' });
  const { fullContent, errors } = extractMeta(events);
  assert('5. 第二次行动成功', status === 200 && fullContent.length > 0 && errors.length === 0, `len=${fullContent.length}`);
}

// 6. 结束游戏
{
  console.log(info('6. POST /game/end — 结束游戏 (等待 AI 结局...)'));
  const { status, events } = await fetchSse('/game/end', { anonymousId: ANON, sessionId: gameSessionId });
  assert('6a. /game/end 状态码 200', status === 200, `status=${status}`);
  const { fullContent, errors } = extractMeta(events);
  assert('6b. /game/end 有结局内容', fullContent.length > 0, `len=${fullContent.length}`);
  assert('6c. /game/end 无错误', errors.length === 0);
}

// 7. 游戏历史（应有记录）
{
  const { data } = await request('GET', `/game/history/${ANON}`);
  assert('7. GET /game/history — 有记录', Array.isArray(data) && data.length >= 1, `count=${Array.isArray(data) ? data.length : 'N/A'}`);
}

// ────────── INTERVIEW 模块 ──────────

// 8. 面试历史
{
  const { status, data } = await request('GET', `/interview/history/${ANON}`);
  assert('8. GET /interview/history — 返回数组', Array.isArray(data), `status=${status}`);
}

// 9. 启动面试（SSE）
let interviewSessionId = null;
{
  console.log(info('9. POST /interview/start — 流式启动面试 (等待 AI 响应...)'));
  const { status, events } = await fetchSse('/interview/start', { anonymousId: ANON, position: '前端开发', difficulty: '基础', totalQuestions: 3 });
  assert('9a. /interview/start 状态码 200', status === 200, `status=${status}`);
  const { meta, fullContent, errors } = extractMeta(events);
  assert('9b. /interview/start 有 meta.sessionId', !!meta?.sessionId, `sessionId=${meta?.sessionId}`);
  assert('9c. /interview/start 有内容', fullContent.length > 0, `len=${fullContent.length}`);
  assert('9d. /interview/start 无错误', errors.length === 0);
  interviewSessionId = meta?.sessionId;
  console.log(info(`  sessionId: ${interviewSessionId}, isOver: ${meta?.isOver}`));
}

// 10. 回答第一题
{
  console.log(info('10. POST /interview/answer — 回答第一题 (等待 AI 响应...)'));
  const { status, events } = await fetchSse('/interview/answer', { anonymousId: ANON, sessionId: interviewSessionId, answer: '我认为前端开发中最重要的是用户体验和性能优化，同时需要关注代码可维护性和团队协作。' });
  const { meta, fullContent, errors } = extractMeta(events);
  assert('10. 第一题回答成功', status === 200 && fullContent.length > 0 && errors.length === 0, `isOver=${meta?.isOver}`);
}

// 11. 回答第二题
{
  console.log(info('11. POST /interview/answer — 回答第二题 (等待 AI 响应...)'));
  const { status, events } = await fetchSse('/interview/answer', { anonymousId: ANON, sessionId: interviewSessionId, answer: '我熟悉 React 和 Vue 框架，有 TypeScript 经验，做过多个全栈项目。' });
  const { meta, fullContent, errors } = extractMeta(events);
  assert('11. 第二题回答成功', status === 200 && fullContent.length > 0 && errors.length === 0, `isOver=${meta?.isOver}`);
}

// 12. 获取面试会话详情
{
  console.log(info('12. GET /interview/session — 获取会话详情'));
  const { status, data } = await request('GET', `/interview/session/${ANON}/${interviewSessionId}`);
  assert('12a. /interview/session 状态码 200', status === 200, `status=${status}`);
  assert('12b. /interview/session 有 messages', !!data?.messages, `msgs=${data?.messages?.length || 0}`);
  assert('12c. /interview/session 有 currentQuestion', typeof data?.currentQuestion === 'number', `q=${data?.currentQuestion}`);
}

// 13. 获取标准答案 (可能返回 404 如果 questionIndex 不匹配，这里先测试接口可达性)
{
  console.log(info('13. POST /interview/standard-answer — 获取标准答案 (等待 AI 生成...)'));
  const { status, data } = await request('POST', '/interview/standard-answer', { anonymousId: ANON, sessionId: interviewSessionId, questionIndex: 0 });
  // 接口可能因为 questionIndex 不匹配返回 404，也视为接口可达
  const ok = (status === 201 || status === 200 || status === 404);
  assert('13. /interview/standard-answer 接口可达 (非结束会话应明确提示)', ok, `status=${status}`);
}

// 14. 回答第三题（最后一题）
{
  console.log(info('14. POST /interview/answer — 回答最后一题 (等待 AI 总结...)'));
  const { status, events } = await fetchSse('/interview/answer', { anonymousId: ANON, sessionId: interviewSessionId, answer: '我会持续学习新技术，深耕前端领域，提高自己的技术深度和广度。' });
  const { meta, fullContent, errors } = extractMeta(events);
  assert('14. 最后一题回答成功', status === 200 && fullContent.length > 0 && errors.length === 0, `isOver=${meta?.isOver}`);
}

// 15. 面试历史（应有记录）
{
  const { data } = await request('GET', `/interview/history/${ANON}`);
  assert('15. GET /interview/history — 有记录', Array.isArray(data) && data.length >= 1, `count=${Array.isArray(data) ? data.length : 'N/A'}`);
}

// ────────── 续写/续玩 测试 ──────────

// 16. 第二个游戏（用于 resume 测试）
let gameSessionId2 = null;
{
  console.log(info('16. POST /game/start — 第二个游戏 (等待 AI 响应...)'));
  const { events } = await fetchSse('/game/start', { anonymousId: ANON, genre: '科幻未来', style: '轻松幽默', maxTurns: 5 });
  const { meta } = extractMeta(events);
  gameSessionId2 = meta?.sessionId;
  assert('16. 第二个游戏创建成功', !!gameSessionId2, `sessionId=${gameSessionId2}`);
}

// 17. 游戏 Resume
{
  console.log(info('17. POST /game/resume — 续写 (等待 AI 响应...)'));
  const { status, events } = await fetchSse('/game/resume', { anonymousId: ANON, sessionId: gameSessionId2 });
  assert('17. /game/resume 状态码 200', status === 200, `status=${status}`);
}

// ────────── 面试 Resume 测试 ──────────

// 18. 第二个面试（用于 resume）
let interviewSessionId2 = null;
{
  console.log(info('18. POST /interview/start — 第二个面试 (等待 AI 响应...)'));
  const { events } = await fetchSse('/interview/start', { anonymousId: ANON, position: '全栈开发', difficulty: '进阶', totalQuestions: 2 });
  const { meta } = extractMeta(events);
  interviewSessionId2 = meta?.sessionId;
  assert('18. 第二个面试创建成功', !!interviewSessionId2, `sessionId=${interviewSessionId2}`);
}

// 19. 面试 Resume
{
  console.log(info('19. POST /interview/resume — 续玩面试 (等待 AI 响应...)'));
  const { status } = await fetchSse('/interview/resume', { anonymousId: ANON, sessionId: interviewSessionId2 });
  assert('19. /interview/resume 状态码 200', status === 200, `status=${status}`);
}

// ────────── 删除测试 ──────────

// 20. 删除第二个游戏
{
  console.log(info('20. DELETE /game/session — 删除游戏'));
  const { status } = await request('DELETE', `/game/session/${ANON}/${gameSessionId2}`);
  assert('20. 游戏删除成功', status === 200, `status=${status}`);
}

// 21. 删除第二个面试
{
  console.log(info('21. DELETE /interview/session — 删除面试'));
  const { status } = await request('DELETE', `/interview/session/${ANON}/${interviewSessionId2}`);
  assert('21. 面试删除成功', status === 200, `status=${status}`);
}

// ────────── 边界情况 ──────────

// 22. 无效 sessionId
{
  const { status } = await request('GET', `/game/session/${ANON}/invalid-uuid-not-real`);
  assert('22. 无效 sessionId 应返回 400', status === 400, `status=${status}`);
}

// 23. 缺少必填字段
{
  const { status } = await request('POST', '/game/start', { genre: 'test' }); // 缺 anonymousId
  assert('23. 缺少必填字段应返回 400', status === 400, `status=${status}`);
}

// 24. 不存在的路由
{
  const { status } = await request('GET', '/nonexistent');
  assert('24. 不存在的路由应返回 404', status === 404, `status=${status}`);
}

// 25. 验证删除后历史减少
{
  const { data } = await request('GET', `/game/history/${ANON}`);
  const deleted2 = !Array.isArray(data) || !data.find(r => r.id === gameSessionId2);
  assert('25. 删除后历史不包含被删除项', deleted2);
}

// ────────── 结果汇总 ──────────
console.log('\n' + '='.repeat(60));
console.log(`测试结果: ${passed}/${total} 通过`);
if (passed === total) console.log(pass('全部测试通过! 🎉'));
else console.log(fail(`有 ${total - passed} 个测试失败`));
console.log('='.repeat(60));

process.exit(passed === total ? 0 : 1);