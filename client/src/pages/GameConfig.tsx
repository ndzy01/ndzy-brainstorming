import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAnonymousId } from '../hooks/useAnonymousId';
import { postSse } from '../lib/sse';
import { showToast } from '../components/Toast';

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

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

export default function GameConfig() {
  const navigate = useNavigate();
  const anonymousId = getAnonymousId();
  const [genre, setGenre] = useState('奇幻冒险');
  const [style, setStyle] = useState('热血爽文');
  const [maxTurns, setMaxTurns] = useState(20);
  const [loading, setLoading] = useState(false);

  const startGame = async () => {
    setLoading(true);
    let sessionId: string | undefined;
    const initialMessages: Message[] = [{ role: 'assistant' as const, content: '' }];
    let errored = false;

    try {
      for await (const ev of postSse('/api/game/start', {
        anonymousId, genre, style, maxTurns,
      })) {
        if (ev.type === 'chunk') {
          const last = initialMessages[initialMessages.length - 1];
          if (last && last.role === 'assistant') {
            last.content += ev.content;
          }
        } else if (ev.type === 'meta') {
          sessionId = ev.sessionId;
        } else if (ev.type === 'error') {
          errored = true;
          showToast(`游戏启动失败: ${ev.message}`, 'error');
        }
      }
    } catch {
      errored = true;
      showToast('游戏启动失败', 'error');
    }

    setLoading(false);
    if (errored || sessionId == null) return;

    navigate(`/game/${sessionId}/play`, {
      state: {
        genre,
        style,
        maxTurns,
        initialMessages: initialMessages[0].content ? initialMessages : [],
        turn: 1,
      },
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <header className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-8">
        <Link to="/game" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          <span className="hidden sm:inline">冒险记录</span>
        </Link>
      </header>
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
        <button onClick={startGame} disabled={loading} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold text-lg hover:from-emerald-400 transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50">
          {loading ? '准备中...' : '🎬 开始冒险'}
        </button>
      </div>
    </div>
  );
}