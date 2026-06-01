import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link, useParams, useLocation } from 'react-router-dom';
import { getAnonymousId } from '../hooks/useAnonymousId';
import CopyButton from '../components/CopyButton';
import { showToast } from '../components/Toast';
import { downloadReportHtml, printReportPdf } from '../lib/exportReport';

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface LocationState {
  position: string;
  difficulty: string;
  questionCount: number;
  messages: Message[];
}

export default function InterviewReport() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const state = location.state as LocationState | null;

  if (!state?.messages) {
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8 text-center">
        <p className="text-slate-500 mb-4">未找到报告数据</p>
        <Link to="/interview" className="text-indigo-500 hover:text-indigo-600">返回面试记录</Link>
      </div>
    );
  }

  const { position, difficulty, questionCount, messages } = state;
  const anonymousId = getAnonymousId();

  const [standardAnswers, setStandardAnswers] = useState<Record<number, { loading: boolean; content: string | null }>>({});
  const [expandedAnswers, setExpandedAnswers] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);

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

  const prepareExportData = useCallback(async () => {
    const total = questionCount;
    const missing: number[] = [];
    for (let i = 0; i < total; i++) {
      if (!standardAnswers[i]?.content) missing.push(i);
    }
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
    return { position, difficulty, totalQuestions: total, messages, standardAnswers: fetched };
  }, [anonymousId, sessionId, questionCount, standardAnswers, position, difficulty, messages]);

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
            <span className="px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-600 text-sm">面试结束</span>
            <Link to="/interview/config" className="px-4 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-sm text-slate-600 hover:bg-slate-200 transition-colors">重新开始</Link>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-4 min-h-[500px] h-[calc(100vh-280px)] overflow-y-auto shadow-sm">
          <div className="space-y-5">
            {messages.map((msg, i) => {
              const aiIndex = messages.filter((m, j) => m.role === 'assistant' && j <= i).length - 1;
              const isQuestion = msg.role === 'assistant' && aiIndex < questionCount;
              const ans = standardAnswers[aiIndex];
              return (
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
                          {isQuestion && (
                            <button
                              onClick={() => {
                                if (ans?.content) {
                                  setExpandedAnswers((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(aiIndex)) next.delete(aiIndex); else next.add(aiIndex);
                                    return next;
                                  });
                                } else {
                                  fetchStandardAnswer(aiIndex);
                                  setExpandedAnswers((prev) => new Set(prev).add(aiIndex));
                                }
                              }}
                              disabled={ans?.loading}
                              className="px-3 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-600 hover:bg-amber-100 transition-colors disabled:opacity-50"
                            >
                              {ans?.loading ? '获取中...' : ans?.content ? (expandedAnswers.has(aiIndex) ? '📋 折叠答案' : '📋 展开答案') : '📋 标准答案'}
                            </button>
                          )}
                        </div>
                        {ans?.content && expandedAnswers.has(aiIndex) && (
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
          </div>
        </div>

        <div className="py-6">
          <div className="text-center mb-5">
            <div className="text-4xl mb-2">🎉</div>
            <p className="text-slate-400 text-sm">以上是 AI 面试官的完整评价报告</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <button
              onClick={() => handleExport('html')}
              disabled={exporting}
              className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors inline-flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              <span>📄</span>{exporting ? '准备中...' : '导出 HTML'}
            </button>
            <button
              onClick={() => handleExport('pdf')}
              disabled={exporting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium hover:from-indigo-400 hover:to-purple-400 transition-all shadow-lg shadow-indigo-500/25 inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>🗂️</span>{exporting ? '准备中...' : '保存为 PDF'}
            </button>
          </div>
          <p className="text-center text-xs text-slate-400 mt-3 px-4">导出前会自动补齐所有标准答案；PDF 会打开打印预览，选「保存为 PDF」即可</p>
        </div>
      </div>
    </div>
  );
}