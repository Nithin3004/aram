'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const TOKEN_KEY = 'aram.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public params?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(API_URL + path, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && token) onUnauthorized?.();
  if (!res.ok) {
    let body: { code?: string; message?: string | string[]; params?: Record<string, unknown> } = {};
    try {
      body = await res.json();
    } catch {
      /* not JSON */
    }
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? res.statusText;
    throw new ApiError(res.status, body.code ?? 'error', msg, body.params);
  }
  if (init.raw) return res as unknown as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Fetch a protected binary (photo, CSV) as an object URL. */
export async function apiBlobUrl(path: string): Promise<string> {
  const res = await api<Response>(path, { raw: true });
  return URL.createObjectURL(await res.blob());
}
