import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AppData, DayRecord } from './types';
import { createDay } from './compute';
import { emptyData } from './seed';
import { todayISO } from './util';
import { dict, type TKey } from './i18n';
import { api, ApiError, checkHealth, diff, fromServer, settingsKey, snapshotOf, tokenStore, type Patch, type SyncedState } from './api';

const KEY = 'fuel-ledger:data:v1';
const SYNCED_KEY = 'fuel-ledger:synced:v1';
const MODE_KEY = 'fuel-ledger:mode';
const POLL_MS = 30_000;
const PUSH_DELAY_MS = 800;
const RETRY_MS = 6_000;

function readLS<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeLS(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    /* storage full / blocked */
  }
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function load(): { data: AppData; fresh: boolean } {
  const parsed = readLS<AppData>(KEY);
  if (parsed && parsed.version === 1 && parsed.settings) return { data: parsed, fresh: false };
  return { data: emptyData(), fresh: true };
}

/** Apply this device's unsent edits on top of fresh server data. */
function applyPatch(base: AppData, p: Patch): AppData {
  const next = structuredClone(base);
  if (p.settings) next.settings = { ...p.settings, language: base.settings.language, theme: base.settings.theme };
  if (p.customers) next.customers = p.customers;
  if (p.receipts) next.receipts = p.receipts;
  for (const d of p.days ?? []) next.days[d.date] = d;
  for (const d of p.deleteDays ?? []) delete next.days[d];
  return next;
}

export type Mode = 'checking' | 'local' | 'cloud';
export type SyncStatus = 'synced' | 'pending' | 'saving' | 'offline' | 'error';

export interface CloudState {
  mode: Mode;
  status: SyncStatus;
  needLogin: boolean;
  /** Env vars the server says are missing. */
  missing: string[];
  loaded: boolean;
  error?: string;
}

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'warn';
}

interface Ctx {
  data: AppData;
  fresh: boolean;
  /** Mutate a deep copy of the data; changes persist automatically. */
  update: (fn: (draft: AppData) => void) => void;
  replace: (next: AppData) => void;
  date: string;
  setDate: (d: string) => void;
  /** Returns the day record, creating it in memory (not persisted) if missing. */
  getDay: (date: string) => { day: DayRecord; exists: boolean };
  /** Edit a day; creates it (with carried-forward openings) on first edit. */
  updateDay: (date: string, fn: (day: DayRecord, data: AppData) => void) => void;
  t: (k: TKey) => string;
  toast: (text: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
  cloud: CloudState;
  login: (password: string) => Promise<void>;
  logout: () => void;
  syncNow: () => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const initial = useMemo(load, []);
  const [data, setData] = useState<AppData>(initial.data);
  const [fresh, setFresh] = useState(initial.fresh);
  const [date, setDateState] = useState(() => {
    try {
      return sessionStorage.getItem('fuel-ledger:date') || todayISO();
    } catch {
      return todayISO();
    }
  });
  const setDate = useCallback((d: string) => {
    setDateState(d);
    try {
      sessionStorage.setItem('fuel-ledger:date', d);
    } catch {
      /* ignore */
    }
  }, []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cloud, setCloud] = useState<CloudState>({ mode: 'checking', status: 'synced', needLogin: false, missing: [], loaded: false });

  const dataRef = useRef(data);
  dataRef.current = data;
  const freshRef = useRef(fresh);
  freshRef.current = fresh;
  const cloudRef = useRef(cloud);
  cloudRef.current = cloud;
  const syncedRef = useRef<SyncedState | null>(readLS<SyncedState>(SYNCED_KEY));
  const pushingRef = useRef(false);
  const pushTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);

  const patchCloud = useCallback((p: Partial<CloudState>) => setCloud((c) => ({ ...c, ...p })), []);
  const setSynced = (s: SyncedState | null) => {
    syncedRef.current = s;
    writeLS(SYNCED_KEY, s);
  };

  /* ---------------- local cache (always) ---------------- */
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => writeLS(KEY, data), 250);
  }, [data]);

  /* ---------------- server sync ---------------- */
  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        tokenStore.set(null);
        patchCloud({ needLogin: true, status: 'pending' });
      } else if (e instanceof ApiError && e.status === 503) {
        patchCloud({ status: 'error', error: e.message });
      } else if (e instanceof ApiError) {
        patchCloud({ status: 'error', error: e.message });
      } else {
        patchCloud({ status: 'offline' });
      }
    },
    [patchCloud]
  );

  const pull = useCallback(
    async (initialLoad: boolean) => {
      const synced = syncedRef.current;
      const res = await api.snapshot(initialLoad || !synced ? undefined : synced.rev);
      if ('unchanged' in res) return;
      const serverEmpty = !res.settings && Object.keys(res.days).length === 0;
      if (serverEmpty) {
        // Brand-new database: this device's data (if any) becomes the first copy.
        setSynced(freshRef.current ? snapshotOf(dataRef.current, res.rev) : { rev: res.rev, settings: '', customers: '', receipts: '', days: {} });
      } else {
        const pending = synced ? diff(dataRef.current, synced) : null;
        const serverData = fromServer(res, dataRef.current);
        setSynced(snapshotOf(serverData, res.rev));
        // Keep edits made on this device that the server hasn't seen yet (e.g. while offline).
        const next = pending ? applyPatch(serverData, pending) : serverData;
        dataRef.current = next;
        setData(next);
        setFresh(false);
      }
      patchCloud({ loaded: true, error: undefined });
    },
    [patchCloud]
  );

  const push = useCallback(async () => {
    const c = cloudRef.current;
    const synced = syncedRef.current;
    if (pushingRef.current || c.mode !== 'cloud' || c.needLogin || !c.loaded || !synced) return;
    const patch = diff(dataRef.current, synced);
    if (!patch) {
      patchCloud({ status: 'synced' });
      return;
    }
    pushingRef.current = true;
    patchCloud({ status: 'saving' });
    try {
      const { rev } = await api.push(patch);
      const next: SyncedState = { ...synced, days: { ...synced.days } };
      if (patch.settings) next.settings = settingsKey(patch.settings);
      if (patch.customers) next.customers = JSON.stringify(patch.customers);
      if (patch.receipts) next.receipts = JSON.stringify(patch.receipts);
      for (const d of patch.days ?? []) next.days[d.date] = JSON.stringify(d);
      for (const d of patch.deleteDays ?? []) delete next.days[d];
      // Someone else wrote in between → keep the old rev so the next pull fetches their changes.
      const otherWriter = rev !== synced.rev + 1;
      next.rev = otherWriter ? synced.rev : rev;
      setSynced(next);
      pushingRef.current = false;
      if (otherWriter) await pull(false);
      const still = diff(dataRef.current, syncedRef.current!);
      patchCloud({ status: still ? 'pending' : 'synced', error: undefined });
      if (still) pushTimer.current = window.setTimeout(() => void push(), PUSH_DELAY_MS);
    } catch (e) {
      pushingRef.current = false;
      handleError(e);
      if (!(e instanceof ApiError && e.status === 401)) {
        window.clearTimeout(pushTimer.current);
        pushTimer.current = window.setTimeout(() => void push(), RETRY_MS);
      }
    }
  }, [handleError, patchCloud, pull]);

  // Start-up: is there a backend, is it configured, are we logged in?
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const h = await checkHealth();
      if (cancelled) return;
      if (h === 'none') {
        writeLS(MODE_KEY, 'local');
        patchCloud({ mode: 'local', loaded: true });
        return;
      }
      if (h === 'offline') {
        const wasCloud = readRaw(MODE_KEY) === 'cloud';
        if (wasCloud && tokenStore.get() && syncedRef.current) {
          patchCloud({ mode: 'cloud', status: 'offline', loaded: true });
        } else {
          patchCloud({ mode: 'local', loaded: true });
        }
        return;
      }
      writeLS(MODE_KEY, 'cloud');
      if (!h.configured) {
        patchCloud({ mode: 'cloud', missing: h.missing });
        return;
      }
      if (!tokenStore.get()) {
        patchCloud({ mode: 'cloud', needLogin: true });
        return;
      }
      patchCloud({ mode: 'cloud' });
      try {
        await pull(true);
      } catch (e) {
        handleError(e);
        if (!(e instanceof ApiError)) patchCloud({ loaded: !!syncedRef.current });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleError, patchCloud, pull]);

  // Push edits shortly after they happen.
  useEffect(() => {
    const c = cloudRef.current;
    if (c.mode !== 'cloud' || !c.loaded || c.needLogin || !syncedRef.current) return;
    if (!diff(data, syncedRef.current)) return;
    if (c.status !== 'saving' && c.status !== 'offline') patchCloud({ status: 'pending' });
    window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => void push(), PUSH_DELAY_MS);
  }, [data, cloud.loaded, cloud.needLogin, cloud.mode, patchCloud, push]);

  // Pick up changes made on other devices.
  const refresh = useCallback(async () => {
    const c = cloudRef.current;
    if (c.mode !== 'cloud' || c.needLogin || !c.loaded || pushingRef.current) return;
    const synced = syncedRef.current;
    if (synced && diff(dataRef.current, synced)) return void push();
    try {
      await pull(false);
      if (cloudRef.current.status === 'offline' || cloudRef.current.status === 'error') patchCloud({ status: 'synced' });
    } catch (e) {
      handleError(e);
    }
  }, [handleError, patchCloud, pull, push]);

  useEffect(() => {
    if (cloud.mode !== 'cloud' || !cloud.loaded || cloud.needLogin) return;
    const id = window.setInterval(() => document.visibilityState === 'visible' && void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [cloud.mode, cloud.loaded, cloud.needLogin, refresh]);

  const login = useCallback(
    async (password: string) => {
      const { token } = await api.login(password);
      tokenStore.set(token);
      patchCloud({ needLogin: false, error: undefined });
      await pull(true);
    },
    [patchCloud, pull]
  );

  const logout = useCallback(() => {
    tokenStore.set(null);
    setSynced(null);
    const blank = emptyData();
    blank.settings.language = dataRef.current.settings.language;
    blank.settings.theme = dataRef.current.settings.theme;
    setData(blank);
    setFresh(true);
    patchCloud({ needLogin: true, loaded: false, status: 'synced' });
  }, [patchCloud]);

  /* ---------------- editing API ---------------- */
  const update = useCallback((fn: (draft: AppData) => void) => {
    setFresh(false);
    setData((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
  }, []);

  const replace = useCallback((next: AppData) => {
    setFresh(false);
    setData(next);
  }, []);

  const getDay = useCallback(
    (d: string) => (data.days[d] ? { day: data.days[d], exists: true } : { day: createDay(data, d), exists: false }),
    [data]
  );

  const updateDay = useCallback(
    (d: string, fn: (day: DayRecord, data: AppData) => void) =>
      update((draft) => {
        if (!draft.days[d]) draft.days[d] = createDay(draft, d);
        const day = draft.days[d];
        if (day.locked) return;
        fn(day, draft);
        day.updatedAt = new Date().toISOString();
      }),
    [update]
  );

  const lang = data.settings.language;
  const t = useCallback((k: TKey) => dict[lang][k] ?? dict.en[k] ?? k, [lang]);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, text, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 2600);
  }, []);

  const value: Ctx = {
    data,
    fresh,
    update,
    replace,
    date,
    setDate,
    getDay,
    updateDay,
    t,
    toast,
    toasts,
    cloud,
    login,
    logout,
    syncNow: () => void refresh(),
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
}
