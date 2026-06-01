import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom';
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

interface LocationState {
  genre?: string;
  style?: string;
  maxTurns?: number;
  initialMessages?: Message[];
  turn?: number;
}

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

export default function GameSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as LocationState) || {};

  const anonymousId = getAnonymousId();
  const [genre, setGenre] = useState(state.genre || '奇幻冒险');
  const [style, setStyle] = useState(state.style || '热血爽文');
  const [maxTurns, setMaxTurns] = useState(state.maxTurns || 20);
  const [messages, setMessages] = useState<Message[]>(state.initialMessages || []);
  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [turn, setTurn] = useState(state.turn || 0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [view, setView] = useState<'loading' | 'playing'>(state.initialMessages ? 'playing' : 'loading');

  const sceneRef = useRef<HTMLDivElement>(null);

  const currentSceneRaw = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].content;
    }
    return '';
  }, [messages]);

  const scene = useMemo(() => parseScene(currentSceneRaw), [currentSceneRaw]);
  const isEnded = !streaming && scene.choices.length === 0 && currentSceneRaw.length > 0 && turn > 1;

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [currentSceneRaw]);

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

  const handleRecapNav = () => {
    navigate(`/game/${sessionId}/recap`, { state: { genre, style, messages } });
  };

  useEffect(() => {
    if (!sessionId || state.initialMessages) return;
    (async () => {
      try {
        const res = await fetch(`/api/game/session/${anonymousId}/${sessionId}`);
        const detail = await res.json();
        const msgs: Message[] = detail.messages || [];
        setMessages(msgs);
        setTurn(detail.turn || 0);
        if (detail.genre) setGenre(detail.genre);
        if (detail.style) setStyle(detail.style);
        if (detail.maxTurns) setMaxTurns(detail.maxTurns);

        const hasAssistant = msgs.some((m: Message) => m.role === 'assistant');
        if (!hasAssistant && !detail.isEnded) {
          setView('loading');
          try {
            let gotAssistant = false;
            for await (const ev of postSse('/api/game/resume', { anonymousId, sessionId })) {
              if (ev.type === 'chunk') {
                gotAssistant = true;
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last && last.role === 'assistant') {
                    next[next.length - 1] = { ...last, content: last.content + ev.content };
                  }
                  return next;
                });
              } else if (ev.type === 'error') {
                showToast(`续写失败: ${ev.message}`, 'error');
              }
            }
            if (gotAssistant) setTurn(1);
          } catch {
            showToast('续写失败', 'error');
          }
        }
        setView('playing');
      } catch {
        showToast('加载会话失败', 'error');
        navigate('/game');
      }
    })();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const consumeSse = useCallback(
    async (url: string, body: unknown, errPrefix: string) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
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
      return { errored };
    },
    [],
  );

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

  const reset = () => { navigate('/game/config'); };

  if (view === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <header className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-8">
          <Link to="/game" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            <span className="hidden sm:inline">冒险记录</span>
          </Link>
        </header>
        <PageLoading message="加载会话中..." />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <header className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-8">
        <Link to="/game" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          <span className="hidden sm:inline">冒险记录</span>
        </Link>
      </header>

      <div>
        <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-xs sm:text-sm px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex-shrink-0">第 {turn || 1} / {maxTurns} 幕</span>
            <h1 className="text-sm sm:text-base font-medium text-slate-600 truncate">{genre} · {style}</h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {messages.filter((m) => m.role === 'assistant').length > 1 && (
              <button onClick={handleRecapNav} className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-600 hover:bg-slate-200 transition-colors">📜 回顾</button>
            )}
            <button onClick={reset} className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-600 hover:bg-slate-200 transition-colors">新冒险</button>
          </div>
        </div>

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

        {isEnded && (
          <div className="text-center py-6">
            <div className="text-4xl mb-2">🎬</div>
            <p className="text-slate-500 text-sm mb-4">故事到此为止</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={handleRecapNav} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 hover:border-emerald-300 transition-colors">📜 剧情回顾</button>
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
      </div>
    </div>
  );
}