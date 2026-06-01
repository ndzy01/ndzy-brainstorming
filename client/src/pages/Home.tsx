import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAnonymousId, regenerateAnonymousId, setAnonymousId, isValidAnonymousId } from '../hooks/useAnonymousId';
import CopyButton from '../components/CopyButton';
import { showToast } from '../components/Toast';

const tools = [
  {
    id: 'interview',
    title: '技术面试官',
    subtitle: 'AI Interview Coach',
    desc: '模拟真实技术面试场景，涵盖前端/后端/算法等多个方向。AI 面试官会根据你的回答动态调整难度，面试结束后给出专业评分报告。',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
      </svg>
    ),
    gradient: 'from-indigo-500 via-purple-500 to-pink-500',
    gradientLight: 'from-indigo-500/80 via-purple-500/80 to-pink-500/80',
  },
  {
    id: 'game',
    title: '互动小说',
    subtitle: 'AI Interactive Fiction',
    desc: '进入 AI 驱动的互动故事世界。选择世界观和叙事风格，你的每一个选择都将影响剧情走向。沉浸式阅读体验，无限分支可能。',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
      </svg>
    ),
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
    gradientLight: 'from-emerald-500/80 via-teal-500/80 to-cyan-500/80',
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [showIdModal, setShowIdModal] = useState(false);
  const [anonymousId, setAnonId] = useState(() => getAnonymousId());
  const [importMode, setImportMode] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [confirmRegen, setConfirmRegen] = useState(false);

  const handleRegenerate = () => {
    const next = regenerateAnonymousId();
    setAnonId(next);
    setConfirmRegen(false);
    showToast('已生成新的匿名 ID', 'success');
  };

  const handleImport = () => {
    const v = importValue.trim();
    if (!isValidAnonymousId(v)) {
      showToast('ID 格式无效（3-64 位字母/数字/_/-）', 'error');
      return;
    }
    setAnonymousId(v);
    setAnonId(v);
    setImportMode(false);
    setImportValue('');
    setShowIdModal(false);
    showToast('已切换匿名 ID', 'success');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-20">
      {/* 匿名 ID 弹窗 */}
      {showIdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowIdModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-800">匿名用户 ID</h2>
              <button onClick={() => setShowIdModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              此 ID 用于关联你所有的会话记录，存储在浏览器本地。换浏览器或清除数据后会重新生成 —— 可以「导入」之前的 ID 来恢复历史。
            </p>
            <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-4 py-2.5 mb-4">
              <code className="text-sm text-slate-600 font-mono flex-1 select-all break-all">
                {anonymousId}
              </code>
              <CopyButton text={anonymousId} />
            </div>

            {!importMode && !confirmRegen && (
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => setImportMode(true)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                >
                  📥 导入已有 ID
                </button>
                <button
                  onClick={() => setConfirmRegen(true)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:border-red-300 hover:text-red-500 transition-colors"
                >
                  🔄 换一个新 ID
                </button>
              </div>
            )}

            {importMode && (
              <div className="space-y-2">
                <input
                  autoFocus
                  type="text"
                  value={importValue}
                  onChange={(e) => setImportValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleImport(); if (e.key === 'Escape') { setImportMode(false); setImportValue(''); } }}
                  placeholder="粘贴匿名 ID..."
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                />
                <div className="flex gap-2">
                  <button onClick={() => { setImportMode(false); setImportValue(''); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition-colors">取消</button>
                  <button onClick={handleImport} disabled={!importValue.trim()} className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-300 text-white text-sm font-medium transition-all">导入</button>
                </div>
              </div>
            )}

            {confirmRegen && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <p className="text-sm text-red-600 mb-3">⚠️ 换 ID 后将无法访问当前 ID 下的会话记录（除非保存原 ID 以便日后导入）。</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmRegen(false)} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-white transition-colors">取消</button>
                  <button onClick={handleRegenerate} className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-400 text-white text-sm font-medium transition-all">确认更换</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="text-center mb-10 sm:mb-16">
        <div className="inline-flex flex-col items-center gap-3 mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-slate-200 text-sm text-slate-500 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            基于 DeepSeek V4 驱动
          </div>
          <button
            onClick={() => setShowIdModal(true)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-500 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
            </svg>
            查看我的匿名 ID
          </button>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-slate-900">
          AI <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">工具箱</span>
        </h1>
        <p className="text-slate-500 text-base sm:text-lg max-w-xl mx-auto px-2">
          选择下方的 AI 应用，体验大语言模型带来的无限可能
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => navigate(`/${tool.id}`)}
            className="group relative p-6 sm:p-8 rounded-2xl border border-slate-200 bg-white shadow-sm
              text-left transition-all duration-300 cursor-pointer
              hover:shadow-xl hover:-translate-y-0.5"
          >
            <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${tool.gradient} text-white mb-5 shadow-lg`}>
              {tool.icon}
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-1">{tool.title}</h3>
            <p className="text-sm text-slate-400 mb-3">{tool.subtitle}</p>
            <p className="text-slate-500 text-sm leading-relaxed">{tool.desc}</p>
            <div className="mt-6 flex items-center gap-2 text-sm font-medium text-slate-400 group-hover:text-indigo-500 transition-colors">
              立即体验
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      <p className="text-center text-slate-400 text-sm mt-10 sm:mt-16">
        所有对话由 DeepSeek 大模型生成，内容仅供参考
      </p>
    </div>
  );
}