import { Platform } from 'react-native';

/** All API routes live under /api; accept the server address with or without it. */
function apiBase(raw: string): string {
  const u = raw.trim().replace(/\/+$/, '');
  return u.endsWith('/api') ? u : `${u}/api`;
}
export const API_URL = apiBase(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api');

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
/** Thrown when the request never reached the server. */
export class OfflineError extends Error {
  constructor() {
    super('offline');
  }
}

let token: string | null = null;
let forcedOffline = false;
export const setToken = (t: string | null) => (token = t);
/** Preview-only switch to simulate having no connection in the browser. */
export const setForcedOffline = (v: boolean) => (forcedOffline = v);
export const isForcedOffline = () => forcedOffline;

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  if (forcedOffline) throw new OfflineError();
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: init.method ?? (init.body || init.form ? 'POST' : 'GET'),
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.form ?? (init.body ? JSON.stringify(init.body) : undefined),
    });
  } catch {
    throw new OfflineError();
  }
  if (!res.ok) {
    let b: { code?: string; message?: string | string[]; params?: Record<string, unknown> } = {};
    try {
      b = await res.json();
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, b.code ?? 'error', Array.isArray(b.message) ? b.message.join(', ') : b.message ?? res.statusText, b.params);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Upload the delivery photo; returns the storage key. */
export async function uploadPhoto(uri: string): Promise<string> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('photo', blob, 'delivery.jpg');
  } else {
    form.append('photo', { uri, name: 'delivery.jpg', type: 'image/jpeg' } as unknown as Blob);
  }
  const r = await api<{ photoKey: string }>('/dispatches/photo', { form });
  return r.photoKey;
}
