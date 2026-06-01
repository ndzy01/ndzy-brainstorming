import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAnonymousId } from '../hooks/useAnonymousId';
import { postSse } from '../lib/sse';
import { showToast } from '../components/Toast';

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

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

export default function InterviewConfig() {
  const navigate = useNavigate();
  const anonymousId = getAnonymousId();
  const [position, setPosition] = useState('前端开发');
  const [difficulty, setDifficulty] = useState('进阶');
  const [questionCount, setQuestionCount] = useState(3);
  const [loading, setLoading] = useState(false);

  const startInterview = async () => {
    setLoading(true);
    let sessionId: string | undefined;
    const initialMessages: Message[] = [{ role: 'assistant' as const, content: '' }];
    let errored = false;

    try {
      for await (const ev of postSse('/api/interview/start', {
        anonymousId, position, difficulty, totalQuestions: questionCount,
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
          showToast(`面试启动失败: ${ev.message}`, 'error');
        }
      }
    } catch {
      errored = true;
      showToast('面试启动失败', 'error');
    }

    setLoading(false);
    if (errored || sessionId == null) return;

    navigate(`/interview/${sessionId}/chat`, {
      state: {
        position,
        difficulty,
        questionCount,
        initialMessages: initialMessages[0].content ? initialMessages : [],
      },
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <header className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-8">
        <Link to="/interview" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          <span className="hidden sm:inline">面试记录</span>
        </Link>
      </header>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2">技术面试官</h1>
        <p className="text-sm sm:text-base text-slate-500">选择岗位和难度，AI 面试官将为你模拟真实面试场景</p>
      </div>
      <div className="space-y-5 sm:space-y-6 bg-white border border-slate-200 rounded-2xl p-4 sm:p-8 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-3">面试岗位</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {POSITIONS.map((p) => (
              <button key={p.value} onClick={() => setPosition(p.value)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-3 rounded-xl border text-sm font-medium transition-all
                  ${position === p.value ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                <span className="text-base">{p.icon}</span>{p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-3">难度等级</label>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
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
        <button onClick={startInterview} disabled={loading} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold text-base sm:text-lg hover:from-indigo-400 hover:to-purple-400 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50">
          {loading ? '准备中...' : '开始面试'}
        </button>
      </div>
    </div>
  );
}