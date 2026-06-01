import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link, useParams, useLocation } from 'react-router-dom';

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface LocationState {
  genre: string;
  style: string;
  messages: Message[];
}

function parseScene(text: string): { narrative: string } {
  if (!text) return { narrative: '' };
  const lines = text.split('\n');
  const choicesIdx = (() => {
    const idxs: number[] = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line && /^\d+[\.、\)]\s*.+$/.test(line)) idxs.unshift(i);
      else if (idxs.length > 0) break;
    }
    return idxs;
  })();
  if (choicesIdx.length < 2) return { narrative: text };
  const firstIdx = choicesIdx[0];
  return { narrative: lines.slice(0, firstIdx).join('\n').trim() };
}

export default function GameRecap() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const state = location.state as LocationState | null;

  if (!state?.messages) {
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8 text-center">
        <p className="text-slate-500 mb-4">未找到剧情数据</p>
        <Link to="/game" className="text-emerald-500 hover:text-emerald-600">返回冒险记录</Link>
      </div>
    );
  }

  const { genre, style, messages } = state;

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
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <header className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-8">
        <Link to={`/game/${sessionId}/play`} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          <span className="hidden sm:inline">返回冒险</span>
        </Link>
        <h1 className="text-lg font-semibold text-slate-800 ml-auto">{genre} · {style}</h1>
      </header>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800 mb-6">📜 剧情回顾</h2>
        <div className="space-y-6">
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
  );
}