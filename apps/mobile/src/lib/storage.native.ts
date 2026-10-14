/** Android: local SQLite (expo-sqlite key-value store) for the offline cache and sync queue. */
import Storage from 'expo-sqlite/kv-store';

export const storage = {
  get(key: string): string | null {
    return Storage.getItemSync(key);
  },
  set(key: string, value: string) {
    Storage.setItemSync(key, value);
  },
  remove(key: string) {
    Storage.removeItemSync(key);
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
