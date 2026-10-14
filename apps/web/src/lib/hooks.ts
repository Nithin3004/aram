'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localName } from '@aram/shared';
import { api, ApiError } from './api';

/** Minimal data hook: load on mount / when path changes, with manual reload. */
export function useData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>(path);
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError(e as ApiError);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

/** Run a mutation with busy + translated error state. */
export function useAction() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
      setBusy(true);
      setError(null);
      try {
        return await fn();
      } catch (e) {
        setError(errorText(e, t));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [t],
  );
  return { busy, error, run, setError };
}

export function errorText(e: unknown, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (e instanceof ApiError) {
    const key = e.code.includes('.') ? e.code : '';
    const translated = key ? t(key, { ...(e.params ?? {}), defaultValue: '' }) : '';
    return translated || e.message;
  }
  return t('common.error');
}

/** Name in the current UI language. */
export function useLocalName() {
  const { i18n } = useTranslation();
  return (o: { nameEn: string; nameTa?: string | null } | null | undefined) => (o ? localName(o, i18n.language) : '');
}
