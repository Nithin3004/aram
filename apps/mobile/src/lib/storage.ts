/**
 * Small persistent key-value store for the offline cache and sync queue.
 * Browser preview: localStorage. Android: SQLite (see storage.native.ts).
 */
export const storage = {
  get(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  },
  remove(key: string) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  },
};

export function getJson<T>(key: string): T | null {
  const v = storage.get(key);
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}
export const setJson = (key: string, v: unknown) => storage.set(key, JSON.stringify(v));
