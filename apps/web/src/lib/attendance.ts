import { tokenStore } from './api';
import type { DayRecord, Machine, PaymentMethod, Product, ShiftSheet, ShiftTemplate } from './types';
import type { RoundingMode } from '@petrolpump/shared';

/** One punch as returned by the server (photo loaded separately). */
export interface Punch {
  id: string;
  staffId: string;
  staffName: string;
  type: 'in' | 'out';
  at: string;
  clientAt: string;
  lat: number;
  lng: number;
  accuracy: number;
  distanceM: number | null;
  inside: boolean | null;
  photoId: string;
  device: string;
  /** petrol / lpg / wine (absent on early punches = petrol). */
  business?: 'petrol' | 'lpg' | 'wine';
}

export interface Geofence {
  lat: number;
  lng: number;
  radiusM: number;
}

export interface StaffStatus {
  staff: { id: string; name: string; businesses: ('petrol' | 'lpg' | 'wine')[] };
  businessNames: Record<string, string>;
  stationName: string;
  last: Punch | null;
  recent: Punch[];
  geofence: Geofence | null;
  serverTime: string;
  openShiftHours: number;
}

/** What the server sends a petrol staff phone: their own shifts in full, others' readings only. */
export interface PetrolWork {
  me: { id: string; name: string };
  date: string;
  serverTime: string;
  settings: {
    stationName: string;
    products: Product[];
    machines: Machine[];
    roundingMode: RoundingMode;
    tolerancePaise: number;
    paymentMethods: PaymentMethod[];
    shiftTemplates: ShiftTemplate[];
    staff: { id: string; name: string; phone: string; active: boolean }[];
  };
  customers: { id: string; name: string }[];
  day: DayRecord | null;
  previousDays: DayRecord[];
}

export interface PetrolSaveResult {
  ok: true;
  shiftId: string;
  day: DayRecord;
  /** Due customers the server added from this save. */
  customers: { id: string; name: string }[];
  /** Typed name matched an existing customer: sent id → real id. */
  aliases: Record<string, string>;
}

export class AttendanceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const STAFF_TOKEN = 'fuel-ledger:staff-token';
const STAFF_NAME = 'fuel-ledger:staff-name';

/** Staff login is kept apart from the owner login on the same device. */
export const staffSession = {
  get(): { token: string; name: string } | null {
    try {
      const token = localStorage.getItem(STAFF_TOKEN);
      return token ? { token, name: localStorage.getItem(STAFF_NAME) ?? '' } : null;
    } catch {
      return null;
    }
  },
  set(token: string | null, name = '') {
    try {
      if (token) {
        localStorage.setItem(STAFF_TOKEN, token);
        localStorage.setItem(STAFF_NAME, name);
      } else {
        localStorage.removeItem(STAFF_TOKEN);
        localStorage.removeItem(STAFF_NAME);
      }
    } catch {
      /* ignore */
    }
  },
};

async function call<T>(action: string, opts: { token?: string | null; method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  const qs = new URLSearchParams({ action, ...(opts.query ?? {}) }).toString();
  let res: Response;
  try {
    res = await fetch(`/api/attendance?${qs}`, {
      method: opts.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new AttendanceError(0, 'offline');
  }
  const json = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok || !json) throw new AttendanceError(res.ok ? 404 : res.status, (json as { error?: string } | null)?.error ?? res.statusText);
  return json as T;
}

export const attendanceApi = {
  staffLogin: (phone: string, pin: string) => call<{ token: string; staff: { id: string; name: string; businesses: string[] } }>('staff-login', { method: 'POST', body: { phone, pin } }),
  status: (token: string) => call<StaffStatus>('status', { token }),
  punch: (token: string, body: { type: 'in' | 'out'; photo: string; lat: number; lng: number; accuracy: number; business: 'petrol' | 'lpg' | 'wine' }) =>
    call<{ ok: true; punch: Punch }>('punch', { token, method: 'POST', body: { ...body, clientAt: new Date().toString(), device: navigator.userAgent } }),
  petrol: (token: string, date: string) => call<PetrolWork>('petrol', { token, query: { date } }),
  petrolSave: (token: string, body: { date: string; machineId: string; shift: Partial<ShiftSheet>; newCustomers?: { id: string; name: string }[]; submit?: boolean }) =>
    call<PetrolSaveResult>('petrol-save', { token, method: 'POST', body }),
  // Owner
  list: (from: string, to: string) => call<{ punches: Punch[]; openShiftHours: number }>('list', { token: tokenStore.get(), query: { from, to } }),
  photo: (id: string) => call<{ data: string }>('photo', { token: tokenStore.get(), query: { id } }),
  remove: (id: string) => call<{ ok: true }>('delete', { token: tokenStore.get(), method: 'POST', query: { id } }),
};

/** Same scheme the server checks: sha256("fuel-ledger:<staffId>:<pin>"). */
export async function hashPin(staffId: string, pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`fuel-ledger:${staffId}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Metres between two points (same formula as the server). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const mapLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

export function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

export interface Session {
  staffId: string;
  staffName: string;
  in: Punch | null;
  out: Punch | null;
  /** Worked minutes (complete sessions only). */
  minutes: number | null;
  /** Punched in long ago with no punch out. */
  missingOut: boolean;
  /** Punched in and still working. */
  open: boolean;
}

/** Pair punches into in → out sessions per staff (input in any order). */
export function toSessions(punches: Punch[], openShiftHours: number, nowMs = Date.now()): Session[] {
  const byStaff = new Map<string, Punch[]>();
  for (const p of punches) byStaff.set(p.staffId, [...(byStaff.get(p.staffId) ?? []), p]);
  const out: Session[] = [];
  for (const list of byStaff.values()) {
    list.sort((a, b) => a.at.localeCompare(b.at));
    let cur: Session | null = null;
    for (const p of list) {
      if (p.type === 'in') {
        if (cur) out.push(closeOpen(cur, openShiftHours, nowMs));
        cur = { staffId: p.staffId, staffName: p.staffName, in: p, out: null, minutes: null, missingOut: false, open: false };
      } else if (cur && cur.in) {
        cur.out = p;
        cur.minutes = Math.round((new Date(p.at).getTime() - new Date(cur.in.at).getTime()) / 60000);
        out.push(cur);
        cur = null;
      } else {
        // Punch out whose punch in is outside the period.
        out.push({ staffId: p.staffId, staffName: p.staffName, in: null, out: p, minutes: null, missingOut: false, open: false });
      }
    }
    if (cur) out.push(closeOpen(cur, openShiftHours, nowMs));
  }
  return out.sort((a, b) => ((b.in ?? b.out)!.at).localeCompare((a.in ?? a.out)!.at));
}

function closeOpen(s: Session, openShiftHours: number, nowMs: number): Session {
  const age = nowMs - new Date(s.in!.at).getTime();
  return { ...s, open: age < openShiftHours * 3600_000, missingOut: age >= openShiftHours * 3600_000 };
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
