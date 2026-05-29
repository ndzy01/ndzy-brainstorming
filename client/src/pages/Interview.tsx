import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { getAnonymousId } from '../hooks/useAnonymousId';
import Loading, { PageLoading } from '../components/Loading';
import CopyButton from '../components/CopyButton';
import { showToast } from '../components/Toast';
import { postSse } from '../lib/sse';
import { downloadReportHtml, printReportPdf } from '../lib/exportReport';

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface HistoryItem {
  id: string;
  position: string;
  difficulty: string;
  totalQuestions: number;
  currentQuestion: number;
  isCompleted: boolean;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

const POSITIONS = [
  { value: '前端开发', label: '前端开发', icon: '🖥' },
  { value: '后端开发', label: '后端开发', icon: '⚙️' },
  { value: '全栈开发', label: '全栈开发', icon: '🚀' },
  { value: '测试工程师', label: '测试工程师', icon: '🧪' },
];

const DIFFICULTIES = [
  { value: '基础', label: '基础', sub: '校招 / 1-2 年', color: 'bg-green-500' },
  { value: '进阶', label: '进阶', sub: '社招 3-5 年', color: 'bg-yellow-500' },
  { value: '深度拷打', label: '深度拷打', sub: '资深 / 大厂高级', color: 'bg-red-500' },
];

export default function Interview() {
  const [view, setView] = useState<'history' | 'config' | 'chatting' | 'finished' | 'resume'>('history');
  const [position, setPosition] = useState('前端开发');
  const [difficulty, setDifficulty] = useState('进阶');
  const [questionCount, setQuestionCount] = useState(3);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [standardAnswers, setStandardAnswers] = useState<Record<number, { loading: boolean; content: string | null }>>({});

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const anonymousId = getAnonymousId();

  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadHistory = useCallback(async () => {
    if (!anonymousId) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/interview/history/${anonymousId}`);
      setHistory(await res.json());
    } catch { showToast('加载历史失败', 'error'); }
    finally { setLoadingHistory(false); }
  }, [anonymousId]);

  useEffect(() => { if (view === 'history') loadHistory(); }, [view, loadHistory]);

  /**
   * 通用 SSE 消费：边收边追加到最后一条 assistant 消息，获取 meta/error
   * 返回 { sessionId, isOver, errored } 供调用方决定后续状态
   */
  const consumeSse = useCallback(
    async (url: string, body: unknown, errPrefix: string) => {
      // 预占一个空的 assistant 消息，后续流式追加
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
      let sessionId: string | undefined;
      let isOver = false;
      let errored = false;
      try {
        for await (const ev of postSse(url, body)) {
          if (ev.type === 'chunk') {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') {
                next[next.length - 1] = { ...last, content: last.content + ev.content };
              }
              return next;
            });
          } else if (ev.type === 'meta') {
            sessionId = ev.sessionId;
            isOver = !!ev.isOver;
          } else if (ev.type === 'error') {
            errored = true;
            // 回滚预占的空消息
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant' && last.content === '') {
                return prev.slice(0, -1);
              }
              return prev;
            });
            showToast(`${errPrefix}: ${ev.message}`, 'error');
          }
        }
      } catch {
        errored = true;
        showToast(errPrefix, 'error');
      }
      return { sessionId, isOver, errored };
    },
    [],
  );

  const startInterview = useCallback(async () => {
    setView('chatting'); setMessages([]); setStreaming(true); setSessionId(null);
    const { sessionId: sid, errored } = await consumeSse(
      '/api/interview/start',
      { anonymousId, position, difficulty, totalQuestions: questionCount },
      '面试启动失败',
    );
    setStreaming(false);
    if (errored) { setView('config'); return; }
    if (sid) setSessionId(sid);
    setProgress({ current: 1, total: questionCount });
  }, [anonymousId, position, difficulty, questionCount, consumeSse]);

  const resumeSession = useCallback(async (id: string) => {
    setView('resume'); setMessages([]); setStreaming(true);
    try {
      const detailRes = await fetch(`/api/interview/session/${anonymousId}/${id}`);
      const detail = await detailRes.json();
      const msgs: Message[] = detail.messages || [];
      setMessages(msgs);
      setProgress({ current: detail.currentQuestion || 0, total: detail.totalQuestions });
      setPosition(detail.position);
      setDifficulty(detail.difficulty);
      setSessionId(id);

      // 最后一条是面试官的问题，用户还没回答，直接展示让用户作答
      const lastMsg = msgs[msgs.length - 1];
      if (!lastMsg || lastMsg.role === 'assistant') {
        setView('chatting');
        setStreaming(false);
        return;
      }

      // 最后一条是用户的回答，需要请求下一题
      const { sessionId: sid, isOver, errored } = await consumeSse(
        '/api/interview/resume',
        { anonymousId, sessionId: id },
        '续玩失败',
      );
      setStreaming(false);
      if (errored) { setView('history'); return; }
      if (sid) setSessionId(sid);
      if (isOver) {
        setView('finished');
        setProgress((prev) => ({ ...prev, current: prev.total }));
      } else {
        setView('chatting');
        setProgress((prev) => ({ ...prev, current: prev.current + 1 }));
      }
    } catch {
      showToast('续玩失败', 'error');
      setView('history');
      setStreaming(false);
    }
  }, [anonymousId, consumeSse]);

  const viewSession = useCallback(async (id: string) => {
    setView('finished'); setStreaming(true); setStandardAnswers({});
    try {
      const res = await fetch(`/api/interview/session/${anonymousId}/${id}`);
      const detail = await res.json();
      setMessages(detail.messages || []);
      setSessionId(id);
      setProgress({ current: detail.totalQuestions, total: detail.totalQuestions });
      // 预填已有的缓存答案
      if (detail.standardAnswers) {
        const cached: Record<number, { loading: boolean; content: string | null }> = {};
        for (const [key, val] of Object.entries(detail.standardAnswers)) {
          cached[Number(key)] = { loading: false, content: val as string };
        }
        setStandardAnswers(cached);
      }
    } catch { showToast('加载会话失败', 'error'); setView('history'); }
    finally { setStreaming(false); }
  }, [anonymousId]);

  const sendAnswer = useCallback(async () => {
    if (!input.trim() || !sessionId || streaming) return;
    const userMsg = input.trim(); setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setStreaming(true);
    const { isOver, errored } = await consumeSse(
      '/api/interview/answer',
      { anonymousId, sessionId, answer: userMsg },
      '发送失败',
    );
    setStreaming(false);
    inputRef.current?.focus();
    if (errored) return;
    if (isOver) {
      setView('finished');
      setProgress((prev) => ({ ...prev, current: prev.total }));
    } else {
      setProgress((prev) => ({ ...prev, current: prev.current + 1 }));
    }
  }, [input, sessionId, streaming, anonymousId, consumeSse]);

  const deleteSession = useCallback(async (id: string) => {
    try { await fetch(`/api/interview/session/${anonymousId}/${id}`, { method: 'DELETE' }); showToast('已删除', 'success'); loadHistory(); }
    catch { showToast('删除失败', 'error'); }
  }, [anonymousId, loadHistory]);

  /** 获取某个问题的标准答案 */
  const fetchStandardAnswer = useCallback(async (questionIndex: number, forceRegenerate = false) => {
    if (!sessionId) return;
    setStandardAnswers((prev) => ({ ...prev, [questionIndex]: { loading: true, content: forceRegenerate ? null : prev[questionIndex]?.content } }));
    try {
      const res = await fetch('/api/interview/standard-answer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anonymousId, sessionId, questionIndex, forceRegenerate }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, 'error'); }
      else { setStandardAnswers((prev) => ({ ...prev, [questionIndex]: { loading: false, content: data.answer } })); }
    } catch { showToast('获取标准答案失败', 'error'); setStandardAnswers((prev) => ({ ...prev, [questionIndex]: { loading: false, content: null } })); }
  }, [anonymousId, sessionId]);

  /** 导出前批量补齐所有标准答案（串行避免压溃后端） */
  const [exporting, setExporting] = useState(false);
  const prepareExportData = useCallback(async () => {
    if (!sessionId) return null;
    const total = progress.total;
    const missing: number[] = [];
    for (let i = 0; i < total; i++) {
      if (!standardAnswers[i]?.content) missing.push(i);
    }

    // 串行拉取（后端有限流，且同 session 有锁）。使用临时 map 避免依赖 React state 快照。
    const fetched: Record<number, string> = {};
    Object.entries(standardAnswers).forEach(([k, v]) => { if (v.content) fetched[Number(k)] = v.content; });

    for (const idx of missing) {
      setStandardAnswers((prev) => ({ ...prev, [idx]: { loading: true, content: prev[idx]?.content ?? null } }));
      try {
        const res = await fetch('/api/interview/standard-answer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ anonymousId, sessionId, questionIndex: idx, forceRegenerate: false }),
        });
        const data = await res.json();
        if (data.answer) {
          fetched[idx] = data.answer;
          setStandardAnswers((prev) => ({ ...prev, [idx]: { loading: false, content: data.answer } }));
        } else {
          setStandardAnswers((prev) => ({ ...prev, [idx]: { loading: false, content: prev[idx]?.content ?? null } }));
        }
      } catch {
        setStandardAnswers((prev) => ({ ...prev, [idx]: { loading: false, content: prev[idx]?.content ?? null } }));
      }
    }

    return {
      position,
      difficulty,
      totalQuestions: total,
      messages,
      standardAnswers: fetched,
    };
  }, [anonymousId, sessionId, progress.total, standardAnswers, position, difficulty, messages]);

  const handleExport = useCallback(async (mode: 'html' | 'pdf') => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await prepareExportData();
      if (!data) return;
      if (mode === 'html') downloadReportHtml(data);
      else printReportPdf(data);
    } finally {
      setExporting(false);
    }
  }, [exporting, prepareExportData]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendAnswer(); }
  };

  const reset = () => { setView('config'); setMessages([]); setSessionId(null); setProgress({ current: 0, total: 0 }); };

  const formatDate = (d: string) => new Date(d).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`${view === 'chatting' || view === 'finished' || view === 'resume' ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-4 py-8`}>
      <header className="flex items-center gap-4 mb-8">
        <Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          返回首页
        </Link>
        {view !== 'config' && view !== 'history' && (
          <button onClick={() => setView('history')} className="ml-auto text-sm text-slate-500 hover:text-indigo-600">面试记录</button>
        )}
      </header>

      {/* History */}
      {view === 'history' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-800">面试记录</h1>
            <button onClick={() => setView('config')} className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium hover:from-indigo-400 transition-all">+ 新面试</button>
          </div>
          {loadingHistory ? <PageLoading message="加载记录中..." /> :
           history.length === 0 ? (
            <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
              <div className="text-4xl mb-4">📋</div>
              <p className="text-slate-500 mb-4">暂无面试记录</p>
              <button onClick={() => setView('config')} className="px-6 py-2.5 rounded-xl bg-indigo-500 text-white font-medium hover:bg-indigo-400">开始第一场面试</button>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 hover:border-slate-300 shadow-sm transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${item.isCompleted ? 'bg-green-400' : 'bg-amber-400'}`} />
                      <span className="text-slate-700 font-medium truncate">{item.title || `${item.position} · ${item.difficulty}`}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>{item.position} · {item.difficulty}</span>
                      <span>{item.currentQuestion}/{item.totalQuestions} 题</span>
                      <span>{formatDate(item.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.isCompleted ? (
                      <button onClick={() => viewSession(item.id)} className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-600 hover:bg-slate-200 transition-colors">查看报告</button>
                    ) : (
                      <button onClick={() => resumeSession(item.id)} className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-600 hover:bg-indigo-100 transition-colors">继续面试</button>
                    )}
                    <button onClick={() => deleteSession(item.id)} className="px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-500 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Config */}
      {view === 'config' && (
        <div>
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">技术面试官</h1>
            <p className="text-slate-500">选择岗位和难度，AI 面试官将为你模拟真实面试场景</p>
          </div>
          <div className="space-y-6 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-3">面试岗位</label>
              <div className="grid grid-cols-3 gap-2">
                {POSITIONS.map((p) => (
                  <button key={p.value} onClick={() => setPosition(p.value)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all
                      ${position === p.value ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                    <span className="text-base">{p.icon}</span>{p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-3">难度等级</label>
              <div className="flex gap-3">
                {DIFFICULTIES.map((d) => (
                  <button key={d.value} onClick={() => setDifficulty(d.value)}
                    className={`flex-1 flex flex-col items-start gap-1 px-4 py-3 rounded-xl border font-medium transition-all
                      ${difficulty === d.value ? 'border-slate-300 bg-slate-100 text-slate-800' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                    <span className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${d.color}`} />{d.label}</span>
                    <span className="text-xs text-slate-400 font-normal">{d.sub}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-3">题目数量: <span className="text-indigo-500">{questionCount}</span> 题 <span className="text-xs text-slate-400 font-normal">（建议 3 题，深度优先）</span></label>
              <input type="range" min={2} max={6} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full h-2 rounded-full bg-slate-200 appearance-none cursor-pointer accent-indigo-500" />
              <div className="flex justify-between text-xs text-slate-400 mt-1"><span>2</span><span>6</span></div>
            </div>
            <button onClick={startInterview} disabled={streaming} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold text-lg hover:from-indigo-400 hover:to-purple-400 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50">
              {streaming ? '准备中...' : '开始面试'}
            </button>
          </div>
        </div>
      )}

      {/* Chat Area */}
      {(view === 'chatting' || view === 'finished' || view === 'resume') && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-slate-800">{position} · {difficulty}面试</h1>
            <div className="flex items-center gap-3">
              {(view === 'chatting' || view === 'resume') && (
                <span className="flex items-center gap-1.5 text-sm text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />进度 {progress.current}/{progress.total}</span>
              )}
              {view === 'finished' && <span className="px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-600 text-sm">面试结束</span>}
              <button onClick={reset} className="px-4 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-sm text-slate-600 hover:bg-slate-200 transition-colors">重新开始</button>
            </div>
          </div>
          {(view === 'chatting' || view === 'resume') && (
            <div className="mb-4 bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-4 min-h-[500px] h-[calc(100vh-280px)] overflow-y-auto shadow-sm">
            <div className="space-y-5">
              {messages.map((msg, i) => {
                const aiIndex = messages.filter((m, j) => m.role === 'assistant' && j <= i).length - 1;
                const isQuestion = msg.role === 'assistant' && aiIndex < progress.total;
                const ans = standardAnswers[aiIndex];
                return (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base ${msg.role === 'assistant' ? 'bg-gradient-to-br from-indigo-500 to-purple-500' : 'bg-slate-200'}`}>
                    {msg.role === 'assistant' ? '🤖' : '👤'}
                  </div>
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'assistant' ? 'bg-slate-50 text-slate-700 rounded-tl-md border border-slate-100 flex-1 min-w-0' : 'bg-indigo-50 text-slate-700 rounded-tr-md max-w-[70%]'}`}>
                    {msg.role === 'assistant' ? (
                      <div>
                        <div className="prose-custom"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                        <div className="mt-2 flex items-center gap-2">
                          <CopyButton text={msg.content} />
                          {view === 'finished' && isQuestion && (
                            <button
                              onClick={() => fetchStandardAnswer(aiIndex)}
                              disabled={ans?.loading}
                              className="px-3 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-600 hover:bg-amber-100 transition-colors disabled:opacity-50"
                            >
                              {ans?.loading ? '获取中...' : '📋 标准答案'}
                            </button>
                          )}
                        </div>
                        {ans?.content && (
                          <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-slate-600 leading-relaxed">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-amber-700">📋 标准答案 / 参考要点：</span>
                              <button
                                onClick={() => fetchStandardAnswer(aiIndex, true)}
                                disabled={ans?.loading}
                                className="text-[10px] text-amber-500 hover:text-amber-700 underline transition-colors disabled:opacity-50"
                              >
                                🔄 重新生成
                              </button>
                            </div>
                            <div className="prose-custom"><ReactMarkdown>{ans.content}</ReactMarkdown></div>
                          </div>
                        )}
                      </div>
                    ) : <p>{msg.content}</p>}
                  </div>
                </div>
                );
              })}
              {streaming && <Loading message="AI 思考中..." size="sm" />}
              <div ref={chatEndRef} />
            </div>
          </div>
          {(view === 'chatting' || view === 'resume') && (
              <div className="flex gap-3 items-end">
                <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="输入你的回答...（Ctrl+Enter / ⌘+Enter 发送，Enter 换行）" rows={3} disabled={streaming} className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50" />
                <button onClick={sendAnswer} disabled={!input.trim() || streaming} className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 disabled:from-slate-300 disabled:to-slate-300 disabled:text-slate-400 text-white font-semibold transition-all shadow-lg shadow-indigo-500/25 flex-shrink-0 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                  <span className="text-sm">发送</span>
                </button>
              </div>
          )}
          {view === 'finished' && (
            <div className="py-6">
              <div className="text-center mb-5">
                <div className="text-4xl mb-2">🎉</div>
                <p className="text-slate-400 text-sm">以上是 AI 面试官的完整评价报告</p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => handleExport('html')}
                  disabled={exporting}
                  className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors inline-flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <span>📄</span>{exporting ? '准备中...' : '导出 HTML'}
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={exporting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium hover:from-indigo-400 hover:to-purple-400 transition-all shadow-lg shadow-indigo-500/25 inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <span>🗂️</span>{exporting ? '准备中...' : '保存为 PDF'}
                </button>
              </div>
              <p className="text-center text-xs text-slate-400 mt-3">导出前会自动补齐所有标准答案；PDF 会打开打印预览，选「保存为 PDF」即可</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}