import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { getAnonymousId } from '../hooks/useAnonymousId';
import Loading, { PageLoading } from '../components/Loading';
import CopyButton from '../components/CopyButton';
import { showToast } from '../components/Toast';
import { postSse } from '../lib/sse';

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface HistoryItem {
  id: string;
  genre: string;
  style: string;
  turn: number;
  isEnded: boolean;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

const GENRES = [
  { value: '奇幻冒险', label: '奇幻冒险', icon: '⚔️', desc: '中土世界、龙与魔法' },
  { value: '科幻未来', label: '科幻未来', icon: '🛸', desc: '赛博朋克、星际探索' },
  { value: '悬疑推理', label: '悬疑推理', icon: '🔍', desc: '密室逃脱、侦探破案' },
  { value: '仙侠修真', label: '仙侠修真', icon: '🏔', desc: '御剑飞行、修炼成仙' },
  { value: '末世生存', label: '末世生存', icon: '🧟', desc: '丧尸危机、废土求生' },
  { value: '都市异能', label: '都市异能', icon: '🌃', desc: '现代都市、超能力者' },
];

const STYLES = [
  { value: '热血爽文', label: '热血爽文', emoji: '🔥' },
  { value: '严肃文学', label: '严肃文学', emoji: '📖' },
  { value: '轻松幽默', label: '轻松幽默', emoji: '😄' },
  { value: '暗黑深沉', label: '暗黑深沉', emoji: '🌑' },
  { value: '浪漫唯美', label: '浪漫唯美', emoji: '🌸' },
  { value: '快节奏', label: '快节奏', emoji: '⚡' },
];

export default function Game() {
  const [view, setView] = useState<'history' | 'config' | 'playing'>('history');
  const [genre, setGenre] = useState('奇幻冒险');
  const [style, setStyle] = useState('热血爽文');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turn, setTurn] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const anonymousId = getAnonymousId();

  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadHistory = useCallback(async () => {
    if (!anonymousId) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/game/history/${anonymousId}`);
      setHistory(await res.json());
    } catch { showToast('加载历史失败', 'error'); }
    finally { setLoadingHistory(false); }
  }, [anonymousId]);

  useEffect(() => { if (view === 'history') loadHistory(); }, [view, loadHistory]);

  /**
   * 通用 SSE 消费：边收边追加到最后一条 assistant 消息
   */
  const consumeSse = useCallback(
    async (url: string, body: unknown, errPrefix: string) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
      let sessionId: string | undefined;
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
          } else if (ev.type === 'error') {
            errored = true;
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
      return { sessionId, errored };
    },
    [],
  );

  const startGame = useCallback(async () => {
    setView('playing'); setMessages([]); setTurn(0); setStreaming(true); setSessionId(null);
    const { sessionId: sid, errored } = await consumeSse(
      '/api/game/start',
      { anonymousId, genre, style },
      '游戏启动失败',
    );
    setStreaming(false);
    if (errored) { setView('config'); return; }
    if (sid) setSessionId(sid);
    setTurn(1);
  }, [anonymousId, genre, style, consumeSse]);

  const sendAction = useCallback(async () => {
    if (!input.trim() || !sessionId || streaming) return;
    const action = input.trim(); setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: `▸ ${action}` }]);
    setStreaming(true);
    const { errored } = await consumeSse(
      '/api/game/action',
      { anonymousId, sessionId, action },
      '行动失败',
    );
    setStreaming(false);
    inputRef.current?.focus();
    if (!errored) setTurn((prev) => prev + 1);
  }, [input, sessionId, streaming, anonymousId, consumeSse]);

  const endGame = useCallback(async () => {
    if (!sessionId) return; setStreaming(true); setShowEndConfirm(false);
    const { errored } = await consumeSse(
      '/api/game/end',
      { anonymousId, sessionId },
      '结束失败',
    );
    setStreaming(false);
    if (!errored) {
      setTurn((prev) => prev + 1);
      showToast('故事已完结', 'success');
    }
  }, [sessionId, anonymousId, consumeSse]);

  const openSession = useCallback(async (id: string) => {
    setView('playing'); setMessages([]); setStreaming(true);
    try {
      const res = await fetch(`/api/game/session/${anonymousId}/${id}`);
      const detail = await res.json();
      setMessages(detail.messages || []);
      setTurn(detail.turn || 0);
      setSessionId(id);
    } catch { showToast('加载会话失败', 'error'); setView('history'); }
    finally { setStreaming(false); }
  }, [anonymousId]);

  const deleteSession = useCallback(async (id: string) => {
    try { await fetch(`/api/game/session/${anonymousId}/${id}`, { method: 'DELETE' }); showToast('已删除', 'success'); loadHistory(); }
    catch { showToast('删除失败', 'error'); }
  }, [anonymousId, loadHistory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAction(); }
  };

  const reset = () => { setView('config'); setMessages([]); setSessionId(null); setTurn(0); };

  const formatDate = (d: string) => new Date(d).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`${view === 'playing' ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-3 sm:px-4 py-4 sm:py-8`}>
      <header className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-8">
        <Link to="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          <span className="hidden sm:inline">返回首页</span>
        </Link>
        {view === 'playing' && (
          <button onClick={() => setView('history')} className="ml-auto text-sm text-slate-500 hover:text-emerald-600">冒险记录</button>
        )}
      </header>

      {/* History */}
      {view === 'history' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-800">冒险记录</h1>
            <button onClick={() => setView('config')} className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium hover:from-emerald-400 transition-all">+ 新冒险</button>
          </div>
          {loadingHistory ? <PageLoading message="加载记录中..." /> :
           history.length === 0 ? (
            <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
              <div className="text-4xl mb-4">📜</div>
              <p className="text-slate-500 mb-4">暂无冒险记录</p>
              <button onClick={() => setView('config')} className="px-6 py-2.5 rounded-xl bg-emerald-500 text-white font-medium hover:bg-emerald-400">开始第一场冒险</button>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 hover:border-slate-300 shadow-sm transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${item.isEnded ? 'bg-slate-400' : 'bg-emerald-400'}`} />
                      <span className="text-slate-700 font-medium truncate">{item.title || `${item.genre} · ${item.style}`}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span>{item.genre} · {item.style}</span>
                      <span>{item.turn} 回合</span>
                      <span>{item.isEnded ? '已完结' : '进行中'}</span>
                      <span>{formatDate(item.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => openSession(item.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${item.isEnded ? 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200' : 'bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100'}`}>
                      {item.isEnded ? '重温故事' : '继续冒险'}
                    </button>
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
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2">互动小说</h1>
            <p className="text-sm sm:text-base text-slate-500">选择一个世界观和叙事风格，AI 将为你创造独一无二的故事。</p>
          </div>
          <div className="space-y-5 sm:space-y-6 bg-white border border-slate-200 rounded-2xl p-4 sm:p-8 shadow-sm">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-3">故事类型</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {GENRES.map((g) => (
                  <button key={g.value} onClick={() => setGenre(g.value)}
                    className={`flex flex-col items-start gap-1 px-3 sm:px-4 py-3 rounded-xl border text-left transition-all
                      ${genre === g.value ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                    <span className="text-lg">{g.icon}</span><span className="text-sm font-medium">{g.label}</span><span className="text-xs opacity-60">{g.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-3">叙事风格</label>
              <div className="flex flex-wrap gap-2">
                {STYLES.map((s) => (
                  <button key={s.value} onClick={() => setStyle(s.value)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all
                      ${style === s.value ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                    <span>{s.emoji}</span>{s.label}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={startGame} disabled={streaming} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold text-lg hover:from-emerald-400 transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50">
              {streaming ? '准备中...' : '🎬 开始冒险'}
            </button>
          </div>
        </div>
      )}

      {/* Playing */}
      {view === 'playing' && (
        <div>
          <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
            <h1 className="text-base sm:text-xl font-bold text-slate-800 truncate min-w-0">{genre} · {style}</h1>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {turn > 0 && <span className="text-xs sm:text-sm text-slate-500">第 {turn} 回合</span>}
              <button onClick={reset} className="px-3 sm:px-4 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs sm:text-sm text-slate-600 hover:bg-slate-200 transition-colors">新冒险</button>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-8 mb-4 min-h-[360px] sm:min-h-[400px] h-[calc(100vh-260px)] sm:h-[calc(100vh-280px)] overflow-y-auto shadow-sm">
            <div className="space-y-6">
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === 'assistant' ? (
                    <div className="prose-custom">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                      <div className="mt-3"><CopyButton text={msg.content} label="复制剧情" /></div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 py-2">
                      <div className="w-1 h-4 rounded-full bg-emerald-500" />
                      <p className="text-emerald-600 font-medium text-sm">{msg.content}</p>
                    </div>
                  )}
                </div>
              ))}
              {streaming && <Loading message="AI 正在续写剧情..." size="sm" />}
              <div ref={chatEndRef} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex gap-2 sm:gap-3">
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="输入数字选择行动，或自由输入..." rows={2} disabled={streaming}
                className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-3 text-base sm:text-sm text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50" />
              <button onClick={sendAction} disabled={!input.trim() || streaming} className="px-4 sm:px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-300 disabled:text-slate-400 text-white font-medium transition-all flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
              </button>
            </div>
            <div className="flex justify-between items-center gap-2">
              <p className="text-xs text-slate-400 hidden sm:block">输入如 "1" 选择选项，也可以自由发挥</p>
              <button onClick={() => setShowEndConfirm(true)} disabled={streaming} className="ml-auto px-4 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-500 hover:text-red-500 transition-colors disabled:opacity-50">结束冒险</button>
            </div>
          </div>
          {showEndConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-sm mx-4 text-center shadow-xl">
                <div className="text-4xl mb-4">🏁</div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">结束冒险？</h3>
                <p className="text-sm text-slate-500 mb-6">AI 将为你生成一个精彩的结局</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowEndConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">继续冒险</button>
                  <button onClick={endGame} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium hover:from-emerald-400 transition-all">生成结局</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}