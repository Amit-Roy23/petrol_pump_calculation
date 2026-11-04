import type { AppData, Customer, DayRecord, DueReceipt, Settings } from './types';

export interface Health {
  ok: boolean;
  configured: boolean;
  missing: string[];
}

export interface ServerSnapshot {
  rev: number;
  settings: Settings | null;
  customers: Customer[];
  receipts: DueReceipt[];
  days: Record<string, DayRecord>;
}

export interface Patch {
  settings?: Settings;
  customers?: Customer[];
  receipts?: DueReceipt[];
  days?: DayRecord[];
  deleteDays?: string[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const TOKEN_KEY = 'fuel-ledger:token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(t: string | null) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string } | null)?.error ?? res.statusText);
  if (!isJson) throw new ApiError(404, 'No API');
  return body as T;
}

/**
 * 'none'    → no backend (static hosting / plain `vite dev`): run fully local.
 * 'offline' → network failure: backend may exist but is unreachable right now.
 */
export async function checkHealth(): Promise<Health | 'none' | 'offline'> {
  try {
    const h = await request<Health & { app?: string }>('health');
    return h.app === 'fuel-ledger' ? h : 'none';
  } catch (e) {
    if (e instanceof ApiError) return 'none';
    return 'offline';
  }
}

export const api = {
  login: (password: string) => request<{ token: string; expiresAt: number }>('login', { method: 'POST', body: JSON.stringify({ password }) }),
  snapshot: (sinceRev?: number) => request<ServerSnapshot | { unchanged: true; rev: number }>(`data${sinceRev ? `?rev=${sinceRev}` : ''}`),
  push: (patch: Patch) => request<{ ok: true; rev: number }>('data', { method: 'PUT', body: JSON.stringify(patch) }),
};

/* ---------- diffing against the last state the server confirmed ---------- */

/** Language/theme are per-device preferences – never synced. */
export function settingsKey(s: Settings): string {
  const { language: _l, theme: _t, ...rest } = s;
  return JSON.stringify(rest);
}

export interface SyncedState {
  rev: number;
  settings: string;
  customers: string;
  receipts: string;
  days: Record<string, string>;
}

export function snapshotOf(data: AppData, rev: number): SyncedState {
  const days: Record<string, string> = {};
  for (const [d, rec] of Object.entries(data.days)) days[d] = JSON.stringify(rec);
  return {
    rev,
    settings: settingsKey(data.settings),
    customers: JSON.stringify(data.customers),
    receipts: JSON.stringify(data.receipts),
    days,
  };
}

export function diff(data: AppData, synced: SyncedState): Patch | null {
  const patch: Patch = {};
  if (settingsKey(data.settings) !== synced.settings) patch.settings = data.settings;
  if (JSON.stringify(data.customers) !== synced.customers) patch.customers = data.customers;
  if (JSON.stringify(data.receipts) !== synced.receipts) patch.receipts = data.receipts;
  const changedDays = Object.entries(data.days)
    .filter(([d, rec]) => synced.days[d] !== JSON.stringify(rec))
    .map(([, rec]) => rec);
  if (changedDays.length) patch.days = changedDays;
  const deleted = Object.keys(synced.days).filter((d) => !data.days[d]);
  if (deleted.length) patch.deleteDays = deleted;
  return Object.keys(patch).length ? patch : null;
}

/** Turn a server snapshot into app data, keeping this device's language/theme. */
export function fromServer(s: ServerSnapshot, local: AppData): AppData {
  return {
    version: 1,
    settings: { ...(s.settings as Settings), language: local.settings.language, theme: local.settings.theme },
    days: s.days,
    customers: s.customers,
    receipts: s.receipts,
  };
}
