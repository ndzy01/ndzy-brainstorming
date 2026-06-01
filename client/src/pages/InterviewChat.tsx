import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom';
import { getAnonymousId } from '../hooks/useAnonymousId';
import Loading, { PageLoading } from '../components/Loading';
import CopyButton from '../components/CopyButton';
import { showToast } from '../components/Toast';
import { postSse } from '../lib/sse';

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface LocationState {
  position?: string;
  difficulty?: string;
  questionCount?: number;
  initialMessages?: Message[];
}

export default function InterviewChat() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as LocationState) || {};

  const anonymousId = getAnonymousId();
  const [position, setPosition] = useState(state.position || '前端开发');
  const [difficulty, setDifficulty] = useState(state.difficulty || '进阶');
  const [questionCount, setQuestionCount] = useState(state.questionCount || 3);
  const [messages, setMessages] = useState<Message[]>(state.initialMessages || []);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: questionCount });
  const [loading, setLoading] = useState(!state.initialMessages);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  // Load session on mount if no initial messages
  useEffect(() => {
    if (!sessionId || state.initialMessages) return;
    (async () => {
      try {
        const res = await fetch(`/api/interview/session/${anonymousId}/${sessionId}`);
        const detail = await res.json();
        setPosition(detail.position);
        setDifficulty(detail.difficulty);
        setQuestionCount(detail.totalQuestions);
        setProgress({ current: detail.currentQuestion || 0, total: detail.totalQuestions });

        if (detail.isCompleted) {
          navigate(`/interview/${sessionId}/report`, { replace: true, state: { position: detail.position, difficulty: detail.difficulty, questionCount: detail.totalQuestions, messages: detail.messages } });
          return;
        }

        const msgs: Message[] = detail.messages || [];
        const lastMsg = msgs[msgs.length - 1];

        if (!lastMsg || lastMsg.role === 'assistant') {
          setMessages(msgs);
          setLoading(false);
          return;
        }

        // Last is user → resume
        setMessages(msgs);
        try {
          for await (const ev of postSse('/api/interview/resume', { anonymousId, sessionId })) {
            if (ev.type === 'chunk') {
              setMessages((prev) => {
                const next = [...prev, { role: 'assistant' as const, content: ev.content }];
                // Append to last assistant message or create new
                const last = next[next.length - 1];
                if (last && last.role === 'assistant' && next.length > 1 && next[next.length - 2]?.role === 'assistant') {
                  // This shouldn't happen with the correct initial state
                }
                return next;
              });
            } else if (ev.type === 'meta') {
              if (ev.isOver) {
                // Need to get full messages and navigate to report
                const full = await fetch(`/api/interview/session/${anonymousId}/${sessionId}`).then(r => r.json());
                navigate(`/interview/${sessionId}/report`, { replace: true, state: { position: detail.position, difficulty: detail.difficulty, questionCount: detail.totalQuestions, messages: full.messages } });
                return;
              }
            } else if (ev.type === 'error') {
              showToast(`续玩失败: ${ev.message}`, 'error');
            }
          }
        } catch {
          showToast('续玩失败', 'error');
        }
        setLoading(false);
      } catch {
        showToast('加载会话失败', 'error');
        navigate('/interview');
      }
    })();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendAnswer = useCallback(async () => {
    if (!input.trim() || !sessionId || streaming) return;
    const userMsg = input.trim(); setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setStreaming(true);

    const newMsgs = [...messages, { role: 'user' as const, content: userMsg }];
    let isOver = false;
    let errored = false;

    try {
      setMessages([...newMsgs, { role: 'assistant', content: '' }]);
      for await (const ev of postSse('/api/interview/answer', { anonymousId, sessionId, answer: userMsg })) {
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
          isOver = !!ev.isOver;
        } else if (ev.type === 'error') {
          errored = true;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.content === '') return prev.slice(0, -1);
            return prev;
          });
          showToast(`发送失败: ${ev.message}`, 'error');
        }
      }
    } catch {
      errored = true;
      showToast('发送失败', 'error');
    }

    setStreaming(false);
    if (errored) return;

    if (isOver) {
      const full = await fetch(`/api/interview/session/${anonymousId}/${sessionId}`).then(r => r.json());
      navigate(`/interview/${sessionId}/report`, { replace: true, state: { position, difficulty, questionCount: progress.total, messages: full.messages } });
    } else {
      setProgress((prev) => ({ ...prev, current: prev.current + 1 }));
      inputRef.current?.focus();
    }
  }, [input, sessionId, streaming, anonymousId, messages, position, difficulty, progress.total, navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendAnswer(); }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <header className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-8">
          <Link to="/interview" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            <span className="hidden sm:inline">面试记录</span>
          </Link>
        </header>
        <PageLoading message="加载会话中..." />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <header className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-8">
        <Link to="/interview" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          <span className="hidden sm:inline">面试记录</span>
        </Link>
      </header>

      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-slate-800">{position} · {difficulty}面试</h1>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />进度 {progress.current}/{progress.total}</span>
            <Link to="/interview/config" className="px-4 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-sm text-slate-600 hover:bg-slate-200 transition-colors">重新开始</Link>
          </div>
        </div>
        <div className="mb-4 bg-slate-200 rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-4 min-h-[500px] h-[calc(100vh-280px)] overflow-y-auto shadow-sm">
          <div className="space-y-5">
            {messages.filter(m => m.content).map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`hidden sm:flex w-9 h-9 rounded-xl items-center justify-center flex-shrink-0 text-base self-start ${msg.role === 'assistant' ? 'bg-gradient-to-br from-indigo-500 to-purple-500' : 'bg-slate-200'}`}>
                  {msg.role === 'assistant' ? '🤖' : '👤'}
                </div>
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'assistant' ? 'bg-slate-50 text-slate-700 rounded-tl-md border border-slate-100 flex-1 min-w-0' : 'bg-indigo-50 text-slate-700 rounded-tr-md max-w-[70%]'}`}>
                  {msg.role === 'assistant' ? (
                    <div>
                      <div className="prose-custom"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                      <div className="mt-2 flex items-center gap-2">
                        <CopyButton text={msg.content} />
                      </div>
                    </div>
                  ) : <p>{msg.content}</p>}
                </div>
              </div>
            ))}
            {streaming && <Loading message="AI 思考中..." size="sm" />}
            <div ref={chatEndRef} />
          </div>
        </div>
        <div className="flex gap-2 sm:gap-3 items-end">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="输入你的回答...（⌘/Ctrl+Enter 发送）" rows={3} disabled={streaming} className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-3 text-base sm:text-sm text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50" />
          <button onClick={sendAnswer} disabled={!input.trim() || streaming} className="px-4 sm:px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 disabled:from-slate-300 disabled:to-slate-300 disabled:text-slate-400 text-white font-semibold transition-all shadow-lg shadow-indigo-500/25 flex-shrink-0 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
            <span className="text-sm hidden sm:inline">发送</span>
          </button>
        </div>
      </div>
    </div>
  );
}