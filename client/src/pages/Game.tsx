import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { getAnonymousId } from '../hooks/useAnonymousId';
import Loading, { PageLoading } from '../components/Loading';
import CopyButton from '../components/CopyButton';
import { showToast } from '../components/Toast';
import { postSse } from '../lib/sse';
import { downloadStoryHtml, printStoryPdf } from '../lib/exportStory';

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

/** 从 AI 文本中解析出叙事正文 + 数字编号选项 */
function parseScene(text: string): { narrative: string; choices: string[] } {
  if (!text) return { narrative: '', choices: [] };
  const lines = text.split('\n');
  const choices: { num: number; content: string; lineIdx: number }[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = line.match(/^(\d+)[\.、\)]\s*(.+)$/);
    if (m) {
      choices.unshift({ num: Number(m[1]), content: m[2], lineIdx: i });
    } else if (choices.length > 0) {
      break;
    }
  }
  if (choices.length < 2) return { narrative: text, choices: [] };
  const expected = choices.map((_, i) => i + 1).join(',');
  const actual = choices.map((c) => c.num).join(',');
  if (expected !== actual) return { narrative: text, choices: [] };
  const firstIdx = choices[0].lineIdx;
  const narrative = lines.slice(0, firstIdx).join('\n').trim();
  return { narrative, choices: choices.map((c) => c.content) };
}

export default function Game() {
  const [view, setView] = useState<'history' | 'config' | 'playing'>('history');
  const [genre, setGenre] = useState('奇幻冒险');
  const [style, setStyle] = useState('热血爽文');
  const [maxTurns, setMaxTurns] = useState(20);
  const [messages, setMessages] = useState<Message[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turn, setTurn] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const sceneRef = useRef<HTMLDivElement>(null);
  const anonymousId = getAnonymousId();

  const currentSceneRaw = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].content;
    }
    return '';
  }, [messages]);

  const scene = useMemo(() => parseScene(currentSceneRaw), [currentSceneRaw]);
  const isEnded = !streaming && scene.choices.length === 0 && currentSceneRaw.length > 0 && turn > 1;

  // 流式追加时自动向下滚动
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [currentSceneRaw]);

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

  const consumeSse = useCallback(
    async (url: string, body: unknown, errPrefix: string) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
      let sid: string | undefined;
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
            sid = ev.sessionId;
          } else if (ev.type === 'error') {
            errored = true;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant' && last.content === '') return prev.slice(0, -1);
              return prev;
            });
            showToast(`${errPrefix}: ${ev.message}`, 'error');
          }
        }
      } catch {
        errored = true;
        showToast(errPrefix, 'error');
      }
      return { sessionId: sid, errored };
    },
    [],
  );

  const startGame = useCallback(async () => {
    setView('playing'); setMessages([]); setTurn(0); setStreaming(true); setSessionId(null);
    const { sessionId: sid, errored } = await consumeSse(
      '/api/game/start',
      { anonymousId, genre, style, maxTurns },
      '游戏启动失败',
    );
    setStreaming(false);
    if (errored) { setView('config'); return; }
    if (sid) setSessionId(sid);
    setTurn(1);
  }, [anonymousId, genre, style, maxTurns, consumeSse]);

  const submitAction = useCallback(async (action: string) => {
    if (!action.trim() || !sessionId || streaming) return;
    setMessages((prev) => [...prev, { role: 'user', content: action }]);
    setStreaming(true);
    const { errored } = await consumeSse(
      '/api/game/action',
      { anonymousId, sessionId, action },
      '行动失败',
    );
    setStreaming(false);
    if (!errored) setTurn((prev) => prev + 1);
  }, [sessionId, streaming, anonymousId, consumeSse]);

  const handleChoice = (idx: number, choice: string) => { submitAction(`${idx + 1}. ${choice}`); };
  const handleCustom = () => {
    const v = customInput.trim();
    if (!v) return;
    setCustomInput(''); setShowCustom(false);
    submitAction(v);
  };

  const endGame = useCallback(async () => {
    if (!sessionId) return; setStreaming(true); setShowEndConfirm(false);
    const { errored } = await consumeSse(
      '/api/game/end',
      { anonymousId, sessionId },
      '结束失败',
    );
    setStreaming(false);
    if (!errored) { setTurn((prev) => prev + 1); showToast('故事已完结', 'success'); }
  }, [sessionId, anonymousId, consumeSse]);

  const openSession = useCallback(async (id: string) => {
    setView('playing'); setMessages([]); setStreaming(true);
    try {
      const res = await fetch(`/api/game/session/${anonymousId}/${id}`);
      const detail = await res.json();
      const msgs = detail.messages || [];
      setMessages(msgs);
      setTurn(detail.turn || 0);
      if (detail.genre) setGenre(detail.genre);
      if (detail.style) setStyle(detail.style);
      if (detail.maxTurns) setMaxTurns(detail.maxTurns);
      setSessionId(id);
      // 续写中断的开场：没有任何 assistant 内容时自动 resume
      const hasAssistant = msgs.some((m: Message) => m.role === 'assistant');
      if (!hasAssistant && !detail.isEnded) {
        const { errored } = await consumeSse(
          '/api/game/resume',
          { anonymousId, sessionId: id },
          '续写失败',
        );
        if (!errored) setTurn(1);
      }
    } catch { showToast('加载会话失败', 'error'); setView('history'); }
    finally { setStreaming(false); }
  }, [anonymousId, consumeSse]);

  const deleteSession = useCallback(async (id: string) => {
    try { await fetch(`/api/game/session/${anonymousId}/${id}`, { method: 'DELETE' }); showToast('已删除', 'success'); loadHistory(); }
    catch { showToast('删除失败', 'error'); }
  }, [anonymousId, loadHistory]);

  const reset = () => { setView('config'); setMessages([]); setSessionId(null); setTurn(0); setShowCustom(false); setCustomInput(''); };

  const formatDate = (d: string) => new Date(d).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const recapScenes = useMemo(() => {
    const scenes: { sceneNum: number; narrative: string; action?: string }[] = [];
    let sceneNum = 0;
    let pendingAction: string | undefined;
    for (const m of messages) {
      if (m.role === 'user') {
        pendingAction = m.content;
      } else {
        sceneNum += 1;
        const p = parseScene(m.content);
        scenes.push({ sceneNum, narrative: p.narrative || m.content, action: pendingAction });
        pendingAction = undefined;
      }
    }
    return scenes;
  }, [messages]);

  return (
    <div className={`${view === 'playing' ? 'max-w-4xl' : 'max-w-3xl'} mx-auto px-3 sm:px-4 py-4 sm:py-8`}>
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
                      <span>第 {item.turn} 幕</span>
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
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-slate-600">故事长度</label>
                <span className="text-xs text-slate-400">约 <span className="text-emerald-600 font-medium">{maxTurns}</span> 幕</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { v: 10, label: '短篇', desc: '10 幕' },
                  { v: 20, label: '中篇', desc: '20 幕' },
                  { v: 50, label: '长篇', desc: '50 幕' },
                  { v: 100, label: '史诗', desc: '100 幕' },
                ].map((p) => (
                  <button key={p.v} onClick={() => setMaxTurns(p.v)}
                    className={`flex flex-col items-start gap-0.5 px-4 py-2 rounded-xl border text-sm font-medium transition-all
                      ${maxTurns === p.v ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                    <span>{p.label}</span>
                    <span className="text-xs opacity-60">{p.desc}</span>
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={3}
                max={200}
                step={1}
                value={maxTurns}
                onChange={(e) => setMaxTurns(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1"><span>3 幕</span><span>200 幕</span></div>
            </div>
            <button onClick={startGame} disabled={streaming} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold text-lg hover:from-emerald-400 transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50">
              {streaming ? '准备中...' : '🎬 开始冒险'}
            </button>
          </div>
        </div>
      )}

      {/* Playing — 一幕一幕 */}
      {view === 'playing' && (
        <div>
          <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="text-xs sm:text-sm px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex-shrink-0">第 {turn || 1} / {maxTurns} 幕</span>
              <h1 className="text-sm sm:text-base font-medium text-slate-600 truncate">{genre} · {style}</h1>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {messages.filter((m) => m.role === 'assistant').length > 1 && (
                <button onClick={() => setShowRecap(true)} className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-600 hover:bg-slate-200 transition-colors">📜 回顾</button>
              )}
              <button onClick={reset} className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-600 hover:bg-slate-200 transition-colors">新冒险</button>
            </div>
          </div>

          {/* 场景卡 —— 占满剩余视口，自动跟随滚动；有选项浮层时为其留出底部空间 */}
          <div
            ref={sceneRef}
            className={`bg-gradient-to-br from-white to-emerald-50/30 border border-slate-200 rounded-2xl p-5 sm:p-10 mb-4 min-h-[300px] overflow-y-auto shadow-sm ${
              !streaming && scene.choices.length > 0
                ? 'max-h-[calc(100vh-440px)] sm:max-h-[calc(100vh-400px)]'
                : 'max-h-[calc(100vh-260px)]'
            }`}
          >
            {scene.narrative || currentSceneRaw ? (
              <div className="prose-custom prose-lg sm:prose-xl max-w-none text-lg sm:text-xl leading-loose text-slate-700">
                <ReactMarkdown>{scene.narrative || currentSceneRaw}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full"><Loading message="AI 正在构建场景..." size="md" /></div>
            )}
            {streaming && (scene.narrative || currentSceneRaw) && (
              <div className="mt-4"><Loading message="续写中..." size="sm" /></div>
            )}
            {!streaming && (scene.narrative || currentSceneRaw) && (
              <div className="mt-4 flex justify-end">
                <CopyButton text={scene.narrative || currentSceneRaw} label="复制本幕" />
              </div>
            )}
          </div>

          {/* 浮层选项 —— 固定在视口底部 */}
          {!streaming && scene.choices.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-40 px-3 sm:px-4 pb-4 sm:pb-6 pt-3 bg-gradient-to-t from-white via-white/95 to-white/0 pointer-events-none">
              <div className="max-w-4xl mx-auto pointer-events-auto">
                <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-2xl shadow-slate-900/10 p-3 sm:p-4 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {scene.choices.map((choice, i) => (
                      <button
                        key={i}
                        onClick={() => handleChoice(i, choice)}
                        className="group flex items-start gap-2.5 px-3 sm:px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all text-left"
                      >
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 text-xs font-semibold flex-shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-colors mt-0.5">{i + 1}</span>
                        <span className="text-sm text-slate-700 leading-snug flex-1 line-clamp-2">{choice}</span>
                      </button>
                    ))}
                  </div>
                  {!showCustom ? (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setShowCustom(true)} className="flex-1 py-2 rounded-lg border border-dashed border-slate-300 text-xs sm:text-sm text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                        ✍️ 自定义
                      </button>
                      <button onClick={() => setShowEndConfirm(true)} className="px-4 py-2 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-500 hover:text-red-500 hover:border-red-200 transition-colors">
                        🏁 结束
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 pt-1">
                      <input
                        autoFocus
                        type="text"
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCustom(); if (e.key === 'Escape') { setShowCustom(false); setCustomInput(''); } }}
                        placeholder="描述你想做的事..."
                        className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-3 py-2 text-base sm:text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                      <button onClick={handleCustom} disabled={!customInput.trim()} className="px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-300 text-white text-sm font-medium transition-all flex-shrink-0">执行</button>
                      <button onClick={() => { setShowCustom(false); setCustomInput(''); }} className="px-2 rounded-lg bg-slate-100 border border-slate-200 text-sm text-slate-500 hover:bg-slate-200 transition-colors flex-shrink-0">取消</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 结局 */}
          {isEnded && (
            <div className="text-center py-6">
              <div className="text-4xl mb-2">🎬</div>
              <p className="text-slate-500 text-sm mb-4">故事到此为止</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={() => setShowRecap(true)} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 hover:border-emerald-300 transition-colors">📜 剧情回顾</button>
                <button
                  onClick={() => downloadStoryHtml({
                    genre, style, totalScenes: recapScenes.length, messages, createdAt: new Date().toISOString(),
                  })}
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 hover:border-emerald-300 transition-colors"
                >📄 下载 HTML</button>
                <button
                  onClick={() => printStoryPdf({
                    genre, style, totalScenes: recapScenes.length, messages, createdAt: new Date().toISOString(),
                  })}
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 hover:border-emerald-300 transition-colors"
                >🗂️ 导出 PDF</button>
                <button onClick={reset} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium hover:from-emerald-400 transition-all shadow-lg shadow-emerald-500/25">🎬 开启新冒险</button>
              </div>
            </div>
          )}

          {streaming && !scene.narrative && !currentSceneRaw && (
            <div className="text-center py-4 text-sm text-slate-400">AI 正在编织故事，请稍候...</div>
          )}

          {/* 结束冒险确认 */}
          {showEndConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowEndConfirm(false)}>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 max-w-sm mx-4 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
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

          {/* 剧情回顾 */}
          {showRecap && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowRecap(false)}>
              <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 flex-shrink-0">
                  <h3 className="font-semibold text-slate-800">📜 剧情回顾</h3>
                  <button onClick={() => setShowRecap(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
                  {recapScenes.map((s) => (
                    <div key={s.sceneNum} className="border-l-2 border-emerald-200 pl-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">第 {s.sceneNum} 幕</span>
                        {s.action && <span className="text-xs text-slate-400 truncate">▸ {s.action}</span>}
                      </div>
                      <div className="prose-custom text-sm"><ReactMarkdown>{s.narrative}</ReactMarkdown></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
