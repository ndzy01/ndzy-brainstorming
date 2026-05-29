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