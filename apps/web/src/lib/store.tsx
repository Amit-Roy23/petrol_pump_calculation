import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AppData, DayRecord } from './types';
import { createDay } from './compute';
import { emptyData } from './seed';
import { todayISO } from './util';
import { dict, type TKey } from './i18n';

const KEY = 'fuel-ledger:data:v1';

function load(): { data: AppData; fresh: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed && parsed.version === 1 && parsed.settings) return { data: parsed, fresh: false };
    }
  } catch {
    /* storage blocked or corrupt – fall back to empty */
  }
  return { data: emptyData(), fresh: true };
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
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        /* ignore – private mode etc. */
      }
    }, 250);
  }, [data]);

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

  const value: Ctx = { data, fresh, update, replace, date, setDate, getDay, updateDay, t, toast, toasts };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
}
