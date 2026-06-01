import { useState, useEffect } from 'react';

const STORAGE_KEY = 'ai_toolbox_anonymous_id';

function generateId(): string {
  return `anon_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function useAnonymousId(): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    let stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      stored = generateId();
      localStorage.setItem(STORAGE_KEY, stored);
    }
    setId(stored);
  }, []);

  return id;
}

export function getAnonymousId(): string {
  let stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    stored = generateId();
    localStorage.setItem(STORAGE_KEY, stored);
  }
  return stored;
}

/** 是否为合法的匿名 ID（自动生成或用户自定义）。仅允许字母数字、下划线、连字符，3-64 位 */
export function isValidAnonymousId(id: string): boolean {
  return /^[A-Za-z0-9_-]{3,64}$/.test(id.trim());
}

/** 设置匿名 ID（用于导入），返回是否成功 */
export function setAnonymousId(id: string): boolean {
  const trimmed = id.trim();
  if (!isValidAnonymousId(trimmed)) return false;
  localStorage.setItem(STORAGE_KEY, trimmed);
  return true;
}

/** 重新生成一个新的匿名 ID 并存储，返回新 ID */
export function regenerateAnonymousId(): string {
  const next = generateId();
  localStorage.setItem(STORAGE_KEY, next);
  return next;
}