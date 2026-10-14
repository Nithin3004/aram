'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { Permission } from '@aram/shared';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import i18n, { LANG_KEY, storedLanguage } from './i18n';

export interface Me {
  id: string;
  name: string;
  username: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'SHOP';
  permissions: Permission[];
  language: 'en' | 'ta';
}

interface AuthState {
  me: Me | null;
  ready: boolean;
  language: 'en' | 'ta';
  setLanguage: (l: 'en' | 'ta') => void;
  signedIn: (token: string) => Promise<Me>;
  signOut: () => void;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

function deviceId(): string {
  const k = 'aram.device';
  try {
    let v = localStorage.getItem(k);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return 'web-' + Math.random().toString(36).slice(2);
  }
}
export const getDeviceId = deviceId;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [language, setLang] = useState<'en' | 'ta'>('en');

  const applyLanguage = useCallback((l: 'en' | 'ta') => {
    setLang(l);
    void i18n.changeLanguage(l);
    document.documentElement.lang = l;
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const signOut = useCallback(() => {
    tokenStore.set(null);
    setMe(null);
  }, []);

  useEffect(() => {
    applyLanguage(storedLanguage());
    setUnauthorizedHandler(signOut);
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    api<Me>('/auth/me')
      .then((u) => {
        if (u.role === 'SHOP') return signOut();
        setMe(u);
        // Device choice wins before login; after login the saved per-user choice applies.
        applyLanguage(u.language);
      })
      .catch(() => signOut())
      .finally(() => setReady(true));
  }, [applyLanguage, signOut]);

  const signedIn = useCallback(
    async (token: string) => {
      tokenStore.set(token);
      const u = await api<Me>('/auth/me');
      setMe(u);
      // Keep what the user picked on the login screen and save it to their account.
      const l = storedLanguage();
      if (u.language !== l) void api('/auth/language', { method: 'PATCH', body: { language: l } });
      return u;
    },
    [],
  );

  const setLanguage = useCallback(
    (l: 'en' | 'ta') => {
      applyLanguage(l);
      if (me) {
        setMe({ ...me, language: l });
        void api('/auth/language', { method: 'PATCH', body: { language: l } }).catch(() => undefined);
      }
    },
    [applyLanguage, me],
  );

  const can = useCallback((p: Permission) => !!me && (me.role === 'SUPER_ADMIN' || me.permissions.includes(p)), [me]);

  return <Ctx.Provider value={{ me, ready, language, setLanguage, signedIn, signOut, can }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
