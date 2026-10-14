/**
 * App state: session, language, connectivity, cached snapshot and the offline sync queue.
 * Screens read from here and call these actions; they never talk to the API directly
 * except for online-only flows (receiving), which go through lib/flows.ts.
 */
import NetInfo from '@react-native-community/netinfo';
import { randomUUID } from 'expo-crypto';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, isForcedOffline, OfflineError, setForcedOffline, setToken } from './api';
import i18n, { deviceLanguage, LANG_KEY } from './i18n';
import { getJson, setJson, storage } from './storage';
import type { ChildShop, ClosingDraft, CatalogItem, DispatchDetail, DispatchRow, IssueRow, Me, QueueItem, RequestRow, Snapshot, StockItem } from './types';

const K = { token: 'aram.token', device: 'aram.device', snap: 'aram.snapshot', queue: 'aram.queue', sim: 'aram.simOffline' };

export function deviceId(): string {
  let v = storage.get(K.device);
  if (!v) {
    v = randomUUID();
    storage.set(K.device, v);
  }
  return v;
}

type LoginResult = { otpRequired: false; accessToken: string } | { otpRequired: true; challengeId: string; phoneMasked: string; devCode?: string };

interface Store {
  ready: boolean;
  signedIn: boolean;
  snapshot: Snapshot | null;
  queue: QueueItem[];
  online: boolean;
  syncing: boolean;
  simOffline: boolean;
  language: 'en' | 'ta';
  setLanguage: (l: 'en' | 'ta') => void;
  setSimOffline: (v: boolean) => void;
  login: (username: string, password: string) => Promise<LoginResult>;
  verifyOtp: (challengeId: string, code: string) => Promise<void>;
  resendOtp: (challengeId: string) => Promise<{ challengeId: string; devCode?: string }>;
  signOut: () => void;
  refresh: () => Promise<void>;
  flush: () => Promise<void>;
  enqueue: (item: Omit<QueueItem, 'createdAt' | 'clientId'> & { clientId?: string }) => Promise<'sent' | 'queued'>;
  markClosedLocally: () => void;
}

const Ctx = createContext<Store | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [netOnline, setNetOnline] = useState(true);
  const [simOffline, setSim] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [language, setLang] = useState<'en' | 'ta'>(deviceLanguage());
  const flushing = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);
  const online = netOnline && !simOffline;

  const saveQueue = (q: QueueItem[]) => {
    queueRef.current = q;
    setQueue(q);
    setJson(K.queue, q);
  };

  // ---- boot: restore everything from the device ----
  useEffect(() => {
    const token = storage.get(K.token);
    const sim = storage.get(K.sim) === '1';
    setForcedOffline(sim);
    setSim(sim);
    setToken(token);
    setSignedIn(!!token);
    setSnapshot(getJson<Snapshot>(K.snap));
    const q = getJson<QueueItem[]>(K.queue) ?? [];
    queueRef.current = q;
    setQueue(q);
    setReady(true);
    return NetInfo.addEventListener((s) => setNetOnline(s.isConnected !== false));
  }, []);

  const applyLanguage = useCallback((l: 'en' | 'ta') => {
    setLang(l);
    storage.set(LANG_KEY, l);
    void i18n.changeLanguage(l);
  }, []);

  const setLanguage = useCallback(
    (l: 'en' | 'ta') => {
      applyLanguage(l);
      // Saved per user on the server too; if offline, the device copy keeps it until next login.
      if (storage.get(K.token)) void api('/auth/language', { method: 'PATCH', body: { language: l } }).catch(() => undefined);
    },
    [applyLanguage],
  );

  const signOut = useCallback(() => {
    storage.remove(K.token);
    storage.remove(K.snap);
    setToken(null);
    setSignedIn(false);
    setSnapshot(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!storage.get(K.token)) return;
    try {
      const me = await api<Me>('/auth/me');
      if (me.role !== 'SHOP' || !me.shop) {
        signOut();
        return;
      }
      const shopId = me.shop.id;
      const [shop, dispatches, issues, requests, draft, items, children] = await Promise.all([
        api<{ totalGrams: number; stock: StockItem[] }>(`/shops/${shopId}`),
        api<{ rows: DispatchRow[] }>('/dispatches'),
        api<IssueRow[]>('/issues'),
        api<RequestRow[]>('/requests'),
        api<ClosingDraft>('/closings/draft'),
        api<CatalogItem[]>('/items'),
        me.shop.type === 'SUPERVISOR' ? api<ChildShop[]>('/shops/mine/children') : Promise.resolve([] as ChildShop[]),
      ]);
      const snap: Snapshot = {
        me,
        stock: shop.stock,
        totalGrams: shop.totalGrams,
        incoming: dispatches.rows.filter((d) => d.dest.id === shopId && d.status === 'DISPATCHED'),
        // HO-ordered transfers this supervisor must send (full detail for the order card).
        outgoing: await Promise.all(
          dispatches.rows.filter((d) => d.source.id === shopId && d.status === 'CREATED').map((d) => api<DispatchDetail>(`/dispatches/${d.id}`)),
        ),
        issues,
        requests,
        draft: {
          ...draft,
          // A closing still waiting in the queue counts as done on this phone.
          alreadySubmitted: draft.alreadySubmitted || queueRef.current.some((q) => q.kind === 'closing' && q.body.businessDate === draft.businessDate),
        },
        items,
        children,
        syncedAt: new Date().toISOString(),
      };
      setSnapshot(snap);
      setJson(K.snap, snap);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signOut();
      // OfflineError: keep showing the last snapshot.
    }
  }, [signOut]);

  /** Send queued offline entries, oldest first. Same clientId on retry → server keeps one copy. */
  const flush = useCallback(async () => {
    if (flushing.current || isForcedOffline()) return;
    flushing.current = true;
    setSyncing(true);
    try {
      for (const item of [...queueRef.current]) {
        try {
          await api(item.path, { body: { ...item.body, clientId: item.clientId } });
          saveQueue(queueRef.current.filter((q) => q.clientId !== item.clientId));
        } catch (e) {
          if (e instanceof OfflineError) break;
          if (e instanceof ApiError && e.status === 401) break;
          // Rejected by the server (e.g. day already closed): drop it, remember why.
          if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
            saveQueue(queueRef.current.filter((q) => q.clientId !== item.clientId));
          } else {
            saveQueue(queueRef.current.map((q) => (q.clientId === item.clientId ? { ...q, error: (e as Error).message } : q)));
            break;
          }
        }
      }
      await refresh();
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, [refresh]);

  // Sync whenever we come online, and every 30 s while signed in.
  useEffect(() => {
    if (!signedIn || !online) return;
    void flush();
    const id = setInterval(() => void flush(), 30_000);
    return () => clearInterval(id);
  }, [signedIn, online, flush]);

  const enqueue = useCallback<Store['enqueue']>(
    async (item) => {
      const full: QueueItem = { ...item, clientId: item.clientId ?? randomUUID(), createdAt: new Date().toISOString() };
      saveQueue([...queueRef.current, full]);
      if (online) await flush();
      return queueRef.current.some((q) => q.clientId === full.clientId) ? 'queued' : 'sent';
    },
    [online, flush],
  );

  const markClosedLocally = useCallback(() => {
    setSnapshot((s) => {
      if (!s) return s;
      const next = { ...s, draft: { ...s.draft, alreadySubmitted: true } };
      setJson(K.snap, next);
      return next;
    });
  }, []);

  const finishLogin = useCallback(
    async (accessToken: string) => {
      storage.set(K.token, accessToken);
      setToken(accessToken);
      const me = await api<Me>('/auth/me');
      if (me.role !== 'SHOP') {
        signOut();
        throw new ApiError(403, 'auth.shopOnly', 'Shops only');
      }
      // Keep the language chosen on this device and store it for the user.
      if (me.language !== language) void api('/auth/language', { method: 'PATCH', body: { language } }).catch(() => undefined);
      setSignedIn(true);
      await refresh();
    },
    [language, refresh, signOut],
  );

  const login = useCallback<Store['login']>(
    async (username, password) => {
      const r = await api<LoginResult>('/auth/login', { body: { username, password, deviceId: deviceId() } });
      if (!r.otpRequired) await finishLogin(r.accessToken);
      return r;
    },
    [finishLogin],
  );

  const verifyOtp = useCallback<Store['verifyOtp']>(
    async (challengeId, code) => {
      const r = await api<{ accessToken: string }>('/auth/verify-otp', { body: { challengeId, code } });
      await finishLogin(r.accessToken);
    },
    [finishLogin],
  );

  const resendOtp = useCallback((challengeId: string) => api<{ challengeId: string; devCode?: string }>('/auth/resend-otp', { body: { challengeId } }), []);

  const setSimOffline = useCallback((v: boolean) => {
    setForcedOffline(v);
    setSim(v);
    storage.set(K.sim, v ? '1' : '0');
  }, []);

  const value = useMemo<Store>(
    () => ({ ready, signedIn, snapshot, queue, online, syncing, simOffline, language, setLanguage, setSimOffline, login, verifyOtp, resendOtp, signOut, refresh, flush, enqueue, markClosedLocally }),
    [ready, signedIn, snapshot, queue, online, syncing, simOffline, language, setLanguage, setSimOffline, login, verifyOtp, resendOtp, signOut, refresh, flush, enqueue, markClosedLocally],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}
