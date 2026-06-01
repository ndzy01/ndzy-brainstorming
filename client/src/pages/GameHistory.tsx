import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAnonymousId } from '../hooks/useAnonymousId';
import { PageLoading } from '../components/Loading';
import { showToast } from '../components/Toast';

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

export default function GameHistory() {
  const navigate = useNavigate();
  const anonymousId = getAnonymousId();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    if (!anonymousId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/game/history/${anonymousId}`);
      setHistory(await res.json());
    } catch { showToast('加载历史失败', 'error'); }
    finally { setLoading(false); }
  }, [anonymousId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const deleteSession = async (id: string) => {
    try { await fetch(`/api/game/session/${anonymousId}/${id}`, { method: 'DELETE' }); showToast('已删除', 'success'); loadHistory(); }
    catch { showToast('删除失败', 'error'); }
  };

  const formatDate = (d: string) => new Date(d).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <header className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-8">
        <Link to="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          <span className="hidden sm:inline">返回首页</span>
        </Link>
      </header>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">冒险记录</h1>
        <button onClick={() => navigate('/game/config')} className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium hover:from-emerald-400 transition-all">+ 新冒险</button>
      </div>
      {loading ? <PageLoading message="加载记录中..." /> :
       history.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
          <div className="text-4xl mb-4">📜</div>
          <p className="text-slate-500 mb-4">暂无冒险记录</p>
          <button onClick={() => navigate('/game/config')} className="px-6 py-2.5 rounded-xl bg-emerald-500 text-white font-medium hover:bg-emerald-400">开始第一场冒险</button>
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
                <button onClick={() => navigate(`/game/${item.id}/play`)}
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
  );
}