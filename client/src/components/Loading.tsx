interface LoadingProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Loading({ message = '加载中...', size = 'md' }: LoadingProps) {
  const sizeMap = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' };

  return (
    <div className="flex items-center justify-center gap-3 py-8">
      <svg className={`${sizeMap[size]} animate-spin text-indigo-500`} fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span className="text-sm text-slate-500">{message}</span>
    </div>
  );
}

export function PageLoading({ message = '加载中...' }: { message?: string }) {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
      <p className="text-slate-500 text-sm">{message}</p>
    </div>
  );
}