import { randomUUID } from 'crypto';
import type { Json, Store } from './store';

/**
 * Petrol pump work a staff member does from their own login ("My shift"):
 * read the meter sheet of today / yesterday and fill in their own shift.
 *
 * Everything here runs on the server so a staff phone never receives the
 * owner's money figures, and can never change anyone else's shift.
 */

type Reading = { opening: string; closing: string; testing: string };
type Entry = { id: string; amountPaise: number; note?: string; customerId?: string };
type Line = { id: string; label: string; amountPaise: number };

export interface StaffShift {
  id: string;
  templateId: string;
  label: string;
  start: string;
  end: string;
  staffId: string;
  attendant: string;
  readings: Record<string, Reading>;
  cashPaise: number;
  online: Entry[];
  card: Entry[];
  dues: Entry[];
  extra?: Record<string, Entry[]>;
  expenses?: Line[];
  remark: string;
  /** Set when the staff member pressed "Submit & close shift". */
  submittedAt?: string;
  submittedBy?: string;
  /** Last time a staff member saved this shift from their phone. */
  staffUpdatedAt?: string;
}

interface Sheet {
  machineId: string;
  shifts?: StaffShift[];
  attendant?: string;
  readings?: Record<string, Reading>;
  cashPaise?: number;
  online?: Entry[];
  card?: Entry[];
  dues?: Entry[];
  extra?: Record<string, Entry[]>;
  remark?: string;
}

interface Day {
  date: string;
  rates: Record<string, number>;
  sheets: Record<string, Sheet>;
  closing: { denominations: Record<string, number>; otherCash: Line[]; expenses: Line[] };
  locked: boolean;
  updatedAt: string;
}

interface Nozzle {
  id: string;
  label: string;
  productId: string;
  initialReading: string;
}
interface Machine {
  id: string;
  name: string;
  active: boolean;
  nozzles: Nozzle[];
}

export interface WorkStaff {
  id: string;
  name: string;
}

const DEFAULT_METHODS = [
  { id: 'ppm', name: 'PPM', nameBn: 'পিপিএম', active: true },
  { id: 'pps', name: 'PPS', nameBn: 'পিপিএস', active: true },
];
const DEFAULT_TEMPLATES = [
  { id: 'morning', name: 'Morning', nameBn: 'সকাল', start: '06:00', end: '14:00' },
  { id: 'evening', name: 'Evening', nameBn: 'বিকেল', start: '14:00', end: '22:00' },
  { id: 'night', name: 'Night', nameBn: 'রাত', start: '22:00', end: '06:00' },
];

/** How many earlier days are sent so the phone can carry readings forward. */
const PREVIOUS_DAYS = 7;
const MAX_ENTRIES = 300;
const MAX_PAISE = 100_000_000_00; // ₹10 crore – anything above is a typo

export class WorkError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/* ---------------- small helpers ---------------- */

const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isReading = (v: string) => /^\d{1,9}(\.\d{1,3})?$/.test(v);
const cleanReading = (v: unknown) => {
  const s = str(v, 16);
  return s && /^\d{0,9}(\.\d{0,3})?$/.test(s) ? s : '';
};
const paise = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_PAISE, Math.max(0, Math.round(v))) : 0);

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Staff may work on yesterday, today and (for time zones ahead of UTC) tomorrow-in-UTC. */
export function dateAllowed(date: string, now: Date): boolean {
  if (!isDate(date)) return false;
  const today = now.toISOString().slice(0, 10);
  return date >= addDays(today, -1) && date <= addDays(today, 1);
}

function machines(settings: Json | null): Machine[] {
  const list = settings?.machines as Machine[] | undefined;
  return Array.isArray(list) ? list.filter((m) => m && typeof m.id === 'string' && Array.isArray(m.nozzles)) : [];
}
function methods(settings: Json | null) {
  const list = settings?.paymentMethods as typeof DEFAULT_METHODS | undefined;
  return Array.isArray(list) ? list : DEFAULT_METHODS;
}
function templates(settings: Json | null) {
  const list = settings?.shiftTemplates as typeof DEFAULT_TEMPLATES | undefined;
  return Array.isArray(list) && list.length ? list : DEFAULT_TEMPLATES;
}

const blank = (): Reading => ({ opening: '', closing: '', testing: '' });

/** Same as the web app's legacyShift(): a pre-shift sheet read as its one shift. */
function legacyShift(sheet: Sheet): StaffShift {
  return {
    id: `${sheet.machineId}-s1`,
    templateId: '',
    label: '',
    start: '',
    end: '',
    staffId: '',
    attendant: sheet.attendant ?? '',
    readings: sheet.readings ?? {},
    cashPaise: sheet.cashPaise ?? 0,
    online: sheet.online ?? [],
    card: sheet.card ?? [],
    dues: sheet.dues ?? [],
    extra: sheet.extra ?? {},
    expenses: [],
    remark: sheet.remark ?? '',
  };
}

function hasLegacyData(sheet: Sheet): boolean {
  return (
    !!(sheet.attendant ?? '').trim() ||
    Object.values(sheet.readings ?? {}).some((r) => r && (r.closing || r.opening)) ||
    (sheet.cashPaise ?? 0) > 0 ||
    (sheet.online ?? []).length > 0 ||
    (sheet.card ?? []).length > 0 ||
    (sheet.dues ?? []).length > 0 ||
    Object.values(sheet.extra ?? {}).some((x) => x?.length)
  );
}

/** Moves single-sheet data into `shifts` (same as the web app's ensureShifts). Mutates. */
export function ensureShifts(sheet: Sheet): StaffShift[] {
  if (!sheet.shifts || !sheet.shifts.length) {
    sheet.shifts = hasLegacyData(sheet) ? [legacyShift(sheet)] : [];
    sheet.readings = {};
    sheet.cashPaise = 0;
    sheet.online = [];
    sheet.card = [];
    sheet.dues = [];
    sheet.extra = {};
    sheet.remark = '';
  }
  return sheet.shifts;
}

/** A shift slot nobody has started yet (e.g. the empty "Morning" the owner's app creates). */
function unclaimed(sh: StaffShift): boolean {
  return (
    !sh.staffId &&
    !sh.attendant.trim() &&
    !Object.values(sh.readings ?? {}).some((r) => r?.closing?.trim()) &&
    !sh.cashPaise &&
    !(sh.online ?? []).length &&
    !(sh.card ?? []).length &&
    !(sh.dues ?? []).length &&
    !Object.values(sh.extra ?? {}).some((x) => x?.length) &&
    !(sh.expenses ?? []).length
  );
}

/* ---------------- redaction (what a staff phone may see) ---------------- */

/** Another worker's shift: readings and who/when only – never money. */
function redactShift(sh: StaffShift): StaffShift {
  return {
    id: sh.id,
    templateId: sh.templateId ?? '',
    label: sh.label ?? '',
    start: sh.start ?? '',
    end: sh.end ?? '',
    staffId: sh.staffId ?? '',
    attendant: sh.attendant ?? '',
    readings: sh.readings ?? {},
    cashPaise: 0,
    online: [],
    card: [],
    dues: [],
    extra: {},
    expenses: [],
    remark: '',
    ...(sh.submittedAt ? { submittedAt: sh.submittedAt, submittedBy: sh.submittedBy } : {}),
  };
}

/** A day as a staff member may see it: their own shifts in full, others' readings only. */
export function redactDay(day: Day, staffId: string): Day {
  const sheets: Record<string, Sheet> = {};
  for (const [id, sheet] of Object.entries(day.sheets ?? {})) {
    const copy: Sheet = structuredClone(sheet);
    const shifts = ensureShifts(copy);
    sheets[id] = { machineId: copy.machineId ?? id, shifts: shifts.map((sh) => (sh.staffId === staffId ? sh : redactShift(sh))), attendant: '', readings: {}, cashPaise: 0, online: [], card: [], dues: [], extra: {}, remark: '' };
  }
  return { date: day.date, rates: day.rates ?? {}, sheets, closing: { denominations: {}, otherCash: [], expenses: [] }, locked: !!day.locked, updatedAt: day.updatedAt ?? '' };
}

/* ---------------- GET: what the phone needs ---------------- */

export async function petrolView(store: Store, me: WorkStaff, date: string, now: Date) {
  if (!dateAllowed(date, now)) throw new WorkError(403, 'You can only open today or yesterday');
  const [settings, day, before, customers] = await Promise.all([store.settings(), store.day(date), store.daysBefore(date, PREVIOUS_DAYS), store.customers()]);
  const staff = ((settings?.staff as { id: string; name: string; active?: boolean; businesses?: string[] }[] | undefined) ?? [])
    .filter((s) => s && s.active !== false && (!s.businesses?.length || s.businesses.includes('petrol')))
    .map((s) => ({ id: s.id, name: s.name, phone: '', active: true }));
  return {
    me,
    date,
    serverTime: now.toISOString(),
    settings: {
      stationName: String(settings?.stationName ?? ''),
      products: (settings?.products as unknown[]) ?? [],
      machines: machines(settings)
        .filter((m) => m.active !== false)
        .map((m) => ({ id: m.id, name: m.name, attendant: '', active: true, nozzles: m.nozzles })),
      roundingMode: settings?.roundingMode,
      tolerancePaise: typeof settings?.tolerancePaise === 'number' ? settings.tolerancePaise : 1000,
      paymentMethods: methods(settings),
      shiftTemplates: templates(settings),
      staff,
    },
    customers: (customers as { id: string; name: string; deleted?: boolean }[])
      .filter((c) => c && typeof c.id === 'string' && !c.deleted)
      .map((c) => ({ id: c.id, name: String(c.name ?? '') })),
    day: day ? redactDay(day as unknown as Day, me.id) : null,
    previousDays: (before as unknown as Day[]).map((d) => redactDay(d, '__none__')),
  };
}

/* ---------------- POST: save my shift ---------------- */

function cleanEntries(v: unknown, opts: { customers?: Set<string> } = {}): Entry[] {
  if (!Array.isArray(v)) return [];
  const out: Entry[] = [];
  for (const raw of v.slice(0, MAX_ENTRIES)) {
    const e = raw as Partial<Entry> | null;
    const amountPaise = paise(e?.amountPaise);
    if (!e || !amountPaise) continue;
    const entry: Entry = { id: str(e.id, 64) || randomUUID(), amountPaise };
    const note = str(e.note, 80);
    if (note) entry.note = note;
    if (opts.customers) {
      const cid = str(e.customerId, 64);
      if (!cid || !opts.customers.has(cid)) throw new WorkError(400, 'Pick the customer for every due');
      entry.customerId = cid;
      entry.note = note;
    }
    out.push(entry);
  }
  return out;
}

function cleanLines(v: unknown): Line[] {
  if (!Array.isArray(v)) return [];
  const out: Line[] = [];
  for (const raw of v.slice(0, MAX_ENTRIES)) {
    const l = raw as Partial<Line> | null;
    const amountPaise = paise(l?.amountPaise);
    if (!l || !amountPaise) continue;
    out.push({ id: str(l.id, 64) || randomUUID(), label: str(l.label, 80), amountPaise });
  }
  return out;
}

/** Closing of the latest earlier reading for a nozzle (same rule as the web app). */
function carriedOpening(nozzle: Nozzle, shiftsBefore: StaffShift[], previousDays: Day[]): string {
  for (const sh of [...shiftsBefore].reverse()) {
    const c = sh.readings?.[nozzle.id]?.closing?.trim();
    if (c && isReading(c)) return c;
  }
  for (const d of previousDays) {
    for (const sheet of Object.values(d.sheets ?? {})) {
      const shifts = sheet.shifts && sheet.shifts.length ? sheet.shifts : [legacyShift(sheet)];
      for (const sh of [...shifts].reverse()) {
        const c = sh.readings?.[nozzle.id]?.closing?.trim();
        if (c && isReading(c)) return c;
      }
    }
  }
  return nozzle.initialReading ?? '';
}

function newDay(settings: Json | null, date: string, now: Date): Day {
  const rates: Record<string, number> = {};
  for (const p of (settings?.products as { id: string; ratePaise: number }[] | undefined) ?? []) rates[p.id] = p.ratePaise;
  return { date, rates, sheets: {}, closing: { denominations: {}, otherCash: [], expenses: [] }, locked: false, updatedAt: now.toISOString() };
}

export interface SaveBody {
  date?: unknown;
  machineId?: unknown;
  shift?: Partial<StaffShift> | null;
  /** Due customers typed by the staff member that aren't in the list yet. */
  newCustomers?: { id?: unknown; name?: unknown }[];
  submit?: unknown;
}

export async function petrolSave(store: Store, me: WorkStaff, body: SaveBody, now: Date) {
  const date = body.date;
  if (!isDate(date) || !dateAllowed(date, now)) throw new WorkError(403, 'You can only fill in today or yesterday');
  const input = body.shift;
  if (!input || typeof input !== 'object') throw new WorkError(400, 'Missing shift');

  const [settings, stored, before, customerRows] = await Promise.all([store.settings(), store.day(date), store.daysBefore(date, PREVIOUS_DAYS), store.customers()]);
  const machine = machines(settings).find((m) => m.id === body.machineId && m.active !== false);
  if (!machine) throw new WorkError(400, 'Unknown machine');

  const day: Day = stored ? (structuredClone(stored) as unknown as Day) : newDay(settings, date, now);
  if (day.locked) throw new WorkError(409, 'This day is closed by the owner – ask them to make changes');
  day.sheets ??= {};
  const sheet: Sheet = day.sheets[machine.id] ?? { machineId: machine.id, shifts: [], attendant: '', readings: {}, cashPaise: 0, online: [], card: [], dues: [], extra: {}, remark: '' };
  day.sheets[machine.id] = sheet;
  const shifts = ensureShifts(sheet);

  /* Which shift: my existing one, or a new / unclaimed slot. */
  const id = str(input.id, 64);
  let index = id ? shifts.findIndex((s) => s.id === id) : -1;
  if (index >= 0) {
    const cur = shifts[index];
    if (cur.staffId !== me.id && !unclaimed(cur)) throw new WorkError(403, 'This shift belongs to someone else');
    if (cur.submittedAt) throw new WorkError(409, 'Shift already submitted – ask the owner to make changes');
  } else {
    const last = shifts[shifts.length - 1];
    if (last && unclaimed(last)) index = shifts.length - 1;
    else {
      shifts.push({ id: id || randomUUID(), templateId: '', label: '', start: '', end: '', staffId: '', attendant: '', readings: {}, cashPaise: 0, online: [], card: [], dues: [], extra: {}, expenses: [], remark: '' });
      index = shifts.length - 1;
    }
  }
  const cur = shifts[index];

  /* Shift timing: one of the station's shift templates (or keep what's there). */
  const tpl = templates(settings).find((x) => x.id === input.templateId);
  if (tpl) Object.assign(cur, { templateId: tpl.id, label: tpl.name, start: tpl.start, end: tpl.end });
  else if (!cur.templateId && !cur.label) {
    const t = templates(settings)[index];
    if (t) Object.assign(cur, { templateId: t.id, label: t.name, start: t.start, end: t.end });
  }

  /* Readings: opening carries forward (staff can only fill a blank one). */
  const prevDays = (before as unknown as Day[]).filter((d) => d.date < date);
  const readings: Record<string, Reading> = {};
  for (const n of machine.nozzles) {
    const old = cur.readings?.[n.id] ?? blank();
    const sent = (input.readings as Record<string, Partial<Reading>> | undefined)?.[n.id] ?? {};
    const carried = old.opening?.trim() || carriedOpening(n, shifts.slice(0, index), prevDays);
    const opening = carried || cleanReading(sent.opening);
    readings[n.id] = { opening, closing: cleanReading(sent.closing), testing: cleanReading(sent.testing) };
  }

  /* Dues: known customers, plus names the staff member typed in. */
  const customers = structuredClone(customerRows) as { id: string; name: string; phone?: string; vehicle?: string; openingDuePaise?: number; deleted?: boolean }[];
  const known = new Set(customers.filter((c) => !c.deleted).map((c) => c.id));
  const added: typeof customers = [];
  const alias = new Map<string, string>();
  for (const nc of (Array.isArray(body.newCustomers) ? body.newCustomers : []).slice(0, 20)) {
    const name = str(nc?.name, 60);
    const ncId = str(nc?.id, 64);
    if (!name || !ncId) continue;
    const existing = customers.find((c) => !c.deleted && c.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) alias.set(ncId, existing.id);
    else if (!known.has(ncId)) {
      const row = { id: ncId, name, phone: '', vehicle: '', openingDuePaise: 0 };
      customers.push(row);
      added.push(row);
      known.add(ncId);
    }
  }
  const dueInput = (Array.isArray(input.dues) ? input.dues : []).map((d) => ({ ...d, customerId: alias.get(String(d?.customerId)) ?? d?.customerId }));
  const dues = cleanEntries(dueInput, { customers: known });

  const extra: Record<string, Entry[]> = {};
  const allowedMethods = new Set(methods(settings).map((m) => m.id));
  for (const [mid, list] of Object.entries((input.extra as Record<string, unknown>) ?? {})) {
    if (!allowedMethods.has(mid)) continue;
    const entries = cleanEntries(list);
    if (entries.length) extra[mid] = entries;
  }

  const submit = body.submit === true;
  if (submit) {
    for (const n of machine.nozzles) {
      const r = readings[n.id];
      if (!isReading(r.opening) || !isReading(r.closing)) throw new WorkError(400, `Enter the closing reading of every nozzle before submitting (${n.label})`);
      if (Number(r.closing) < Number(r.opening)) throw new WorkError(400, `Closing is less than opening on ${n.label}`);
    }
  }

  const stamp = now.toISOString();
  shifts[index] = {
    ...cur,
    staffId: me.id,
    attendant: me.name,
    readings,
    cashPaise: paise(input.cashPaise),
    online: cleanEntries(input.online),
    card: cleanEntries(input.card),
    dues,
    extra,
    expenses: cleanLines(input.expenses),
    remark: str(input.remark, 200),
    staffUpdatedAt: stamp,
    ...(submit ? { submittedAt: stamp, submittedBy: me.name } : {}),
  };

  /* The next shift on this machine opens where mine closes (if it still matches). */
  const next = shifts[index + 1];
  if (next) {
    for (const n of machine.nozzles) {
      const nr = next.readings?.[n.id] ?? blank();
      const oldClosing = cur.readings?.[n.id]?.closing?.trim() ?? '';
      const closing = readings[n.id].closing;
      if (closing && (!nr.opening.trim() || nr.opening.trim() === oldClosing)) next.readings = { ...next.readings, [n.id]: { ...nr, opening: closing } };
    }
  }

  day.updatedAt = stamp;
  await store.apply({ days: [day as unknown as Json], ...(added.length ? { customers: customers as unknown as Json[] } : {}) });
  return { ok: true, shiftId: shifts[index].id, day: redactDay(day, me.id), customers: added.map((c) => ({ id: c.id, name: c.name })), aliases: Object.fromEntries(alias) };
}

/* ---------------- owner pushes: never drop a staff member's newer save ---------------- */

/** How long a staff shift missing from an owner's (stale) copy is kept. */
export const KEEP_MISSING_MS = 15 * 60_000;

/**
 * The owner's app sends whole days. If a staff member saved their shift after
 * the owner's copy was loaded, keep the staff version. Returns true if the
 * incoming day was changed.
 */
export function mergeStaffShifts(incoming: Json, stored: Json | null, now: Date): boolean {
  if (!stored) return false;
  let changed = false;
  const inSheets = (incoming.sheets ?? {}) as Record<string, Sheet>;
  for (const [mid, storedSheet] of Object.entries((stored.sheets ?? {}) as Record<string, Sheet>)) {
    const staffShifts = (storedSheet.shifts ?? []).filter((s) => s.staffUpdatedAt);
    if (!staffShifts.length) continue;
    const target = inSheets[mid];
    if (!target) continue; // owner removed the machine's sheet on purpose
    const list = ensureShifts(target);
    for (const s of staffShifts) {
      const i = list.findIndex((x) => x.id === s.id);
      if (i >= 0) {
        if ((list[i].staffUpdatedAt ?? '') < (s.staffUpdatedAt ?? '')) {
          list[i] = structuredClone(s);
          changed = true;
        }
      } else if (now.getTime() - new Date(s.staffUpdatedAt!).getTime() < KEEP_MISSING_MS) {
        // Probably saved after the owner's copy was loaded – keep it in its place.
        const storedList = storedSheet.shifts ?? [];
        const storedIndex = storedList.findIndex((x) => x.id === s.id);
        let at = 0;
        if (storedIndex > 0) {
          const p = list.findIndex((x) => x.id === storedList[storedIndex - 1].id);
          at = p >= 0 ? p + 1 : list.length;
        }
        // An empty slot only in the owner's copy (e.g. a blank "Morning"): the staff shift takes its place.
        const slot = list[at] && unclaimed(list[at]) && !storedList.some((x) => x.id === list[at].id) ? 1 : 0;
        list.splice(at, slot, structuredClone(s));
        changed = true;
      }
    }
  }
  return changed;
}
