import type { AppData, LineItem, LpgCylinder, LpgDay, LpgItem, LpgQtyRow, LpgSettings, LpgStockMove } from './types';
import { sumPaise, uid } from './util';

/* ---------------- defaults ---------------- */

export function defaultLpgSettings(): LpgSettings {
  return {
    businessName: 'LPG Agency',
    newConnectionRatePaise: 450000,
    cylinders: [
      { id: 'dom142', name: 'Domestic 14.2 kg', nameBn: 'ঘরোয়া ১৪.২ কেজি', refillRatePaise: 90500, active: true, openingFull: 0, openingEmpty: 0, openingDefective: 0 },
      { id: 'dom5', name: 'Domestic 5 kg', nameBn: 'ঘরোয়া ৫ কেজি', refillRatePaise: 33900, active: true, openingFull: 0, openingEmpty: 0, openingDefective: 0 },
      { id: 'com19', name: 'Commercial 19 kg', nameBn: 'বাণিজ্যিক ১৯ কেজি', refillRatePaise: 178000, active: true, openingFull: 0, openingEmpty: 0, openingDefective: 0 },
      { id: 'ftl5', name: '5 kg FTL', nameBn: '৫ কেজি FTL', refillRatePaise: 55000, active: false, openingFull: 0, openingEmpty: 0, openingDefective: 0 },
    ],
    items: [
      { id: 'oven', name: 'Oven', nameBn: 'ওভেন', ratePaise: 250000, active: true },
      { id: 'hose', name: 'Hose', nameBn: 'হোস পাইপ', ratePaise: 19000, active: true },
      { id: 'dpr', name: 'DPR (regulator)', nameBn: 'ডিপিআর (রেগুলেটর)', ratePaise: 25000, active: true },
      { id: 'others', name: 'Others', nameBn: 'অন্যান্য', ratePaise: 0, active: true },
    ],
  };
}

export function lpgSettings(data: AppData): LpgSettings {
  return data.settings.lpg ?? defaultLpgSettings();
}

export function lpgDays(data: AppData): Record<string, LpgDay> {
  return data.lpgDays ?? {};
}

const blankMove = (): LpgStockMove => ({ received: 0, emptySent: 0, defectiveFound: 0, defectiveSent: 0 });
const blankRow = (ratePaise: number): LpgQtyRow => ({ ratePaise, qty: 0, onlinePaise: 0, duePaise: 0 });

export function createLpgDay(data: AppData, date: string): LpgDay {
  const st = lpgSettings(data);
  const refills: Record<string, LpgQtyRow> = {};
  for (const c of st.cylinders) if (c.active) refills[c.id] = blankRow(c.refillRatePaise);
  const items: Record<string, LpgQtyRow> = {};
  for (const it of st.items) if (it.active) items[it.id] = blankRow(it.ratePaise);
  return {
    date,
    refills,
    items,
    connections: [],
    refunds: [],
    costs: [],
    stock: {},
    currentAccountPaise: 0,
    edfsAccountPaise: 0,
    remark: '',
    locked: false,
    updatedAt: new Date().toISOString(),
  };
}

/* ---------------- calculation ---------------- */

export interface LpgRowCalc<T> {
  ref: T;
  row: LpgQtyRow;
  amountPaise: number;
  onlinePaise: number;
  duePaise: number;
  /** amount − online − due. Negative means online+due were entered too high. */
  cashPaise: number;
  error: boolean;
}

function rowCalc<T>(ref: T, row: LpgQtyRow): LpgRowCalc<T> {
  const amountPaise = Math.round(row.qty * row.ratePaise);
  const cashPaise = amountPaise - row.onlinePaise - row.duePaise;
  return { ref, row, amountPaise, onlinePaise: row.onlinePaise, duePaise: row.duePaise, cashPaise, error: cashPaise < 0 };
}

export interface LpgStockCalc {
  cylinder: LpgCylinder;
  openFull: number;
  openEmpty: number;
  openDefective: number;
  move: LpgStockMove;
  refilled: number;
  newConnections: number;
  returned: number;
  closeFull: number;
  closeEmpty: number;
  closeDefective: number;
}

export interface LpgDayCalc {
  day: LpgDay;
  refills: LpgRowCalc<LpgCylinder>[];
  items: LpgRowCalc<LpgItem>[];
  /** (A) refilling, with its online (a), cash (d) and due parts. */
  A: number;
  a: number;
  d: number;
  refillDue: number;
  refillQty: number;
  /** (B) product sale, online (b), cash (e). */
  B: number;
  b: number;
  e: number;
  itemDue: number;
  /** (C) new connection / TV-in, online (c), cash (f). */
  C: number;
  c: number;
  f: number;
  connectionDue: number;
  newConnectionCount: number;
  tvInCount: number;
  /** TV return refunds paid out. */
  R: number;
  /** (D) cost. */
  D: number;
  /** A + B + C − R − D. */
  finalPaise: number;
  /** a + b + c. */
  onlinePaise: number;
  /** d + e + f. */
  cashPaise: number;
  duePaise: number;
  /** Cash that should be in hand: cash − refunds − costs (the notebook's "net cash"). */
  cashInHandPaise: number;
  finalBalancePaise: number;
  stock: LpgStockCalc[];
  hasError: boolean;
}

/** Closing stock of every cylinder type for every recorded day, in date order. */
function stockLedger(data: AppData): Map<string, Record<string, { full: number; empty: number; defective: number }>> {
  const st = lpgSettings(data);
  const days = lpgDays(data);
  const out = new Map<string, Record<string, { full: number; empty: number; defective: number }>>();
  let cur: Record<string, { full: number; empty: number; defective: number }> = {};
  for (const c of st.cylinders) cur[c.id] = { full: c.openingFull, empty: c.openingEmpty, defective: c.openingDefective };
  for (const date of Object.keys(days).sort()) {
    const next: typeof cur = {};
    for (const c of st.cylinders) next[c.id] = applyStock(days[date], c.id, cur[c.id] ?? { full: 0, empty: 0, defective: 0 });
    out.set(date, next);
    cur = next;
  }
  return out;
}

function dayCylinderFlows(day: LpgDay, cylId: string) {
  const refilled = day.refills[cylId]?.qty ?? 0;
  const newConnections = day.connections.filter((x) => x.kind === 'new' && x.cylinderId === cylId).length;
  const returned = day.refunds.filter((x) => x.cylinderId === cylId).length;
  return { refilled, newConnections, returned, move: day.stock[cylId] ?? blankMove() };
}

/**
 * Stock logic per cylinder type:
 *  Full      = opening + received − refills − new connections − defective found
 *  Empty     = opening + refills (empty comes back) + TV returns − empties sent
 *  Defective = opening + found − returned to plant
 */
function applyStock(day: LpgDay, cylId: string, open: { full: number; empty: number; defective: number }) {
  const { refilled, newConnections, returned, move } = dayCylinderFlows(day, cylId);
  return {
    full: open.full + move.received - refilled - newConnections - move.defectiveFound,
    empty: open.empty + refilled + returned - move.emptySent,
    defective: open.defective + move.defectiveFound - move.defectiveSent,
  };
}

export function lpgOpeningStock(data: AppData, date: string) {
  const st = lpgSettings(data);
  const ledger = stockLedger(data);
  const before = [...ledger.keys()].filter((d) => d < date).sort().pop();
  const res: Record<string, { full: number; empty: number; defective: number }> = {};
  for (const c of st.cylinders) res[c.id] = before ? ledger.get(before)![c.id] : { full: c.openingFull, empty: c.openingEmpty, defective: c.openingDefective };
  return res;
}

export function computeLpgDay(data: AppData, day: LpgDay): LpgDayCalc {
  const st = lpgSettings(data);
  const refills = st.cylinders
    .filter((c) => c.active || day.refills[c.id]?.qty)
    .map((c) => rowCalc(c, day.refills[c.id] ?? blankRow(c.refillRatePaise)));
  const items = st.items.filter((it) => it.active || day.items[it.id]?.qty).map((it) => rowCalc(it, day.items[it.id] ?? blankRow(it.ratePaise)));

  const sum = <T,>(rows: LpgRowCalc<T>[], k: 'amountPaise' | 'onlinePaise' | 'cashPaise' | 'duePaise') => rows.reduce((acc, r) => acc + r[k], 0);
  const conn = (mode: string) => day.connections.filter((x) => x.mode === mode).reduce((acc, x) => acc + x.amountPaise, 0);

  const A = sum(refills, 'amountPaise');
  const a = sum(refills, 'onlinePaise');
  const d = sum(refills, 'cashPaise');
  const refillDue = sum(refills, 'duePaise');
  const B = sum(items, 'amountPaise');
  const b = sum(items, 'onlinePaise');
  const e = sum(items, 'cashPaise');
  const itemDue = sum(items, 'duePaise');
  const C = day.connections.reduce((acc, x) => acc + x.amountPaise, 0);
  const c = conn('online');
  const f = conn('cash');
  const connectionDue = conn('due');
  const R = sumPaise(day.refunds);
  const D = sumPaise(day.costs);
  const finalPaise = A + B + C - R - D;
  const cashPaise = d + e + f;

  const opening = lpgOpeningStock(data, day.date);
  const stock: LpgStockCalc[] = st.cylinders
    .filter((cy) => cy.active || day.refills[cy.id]?.qty || day.stock[cy.id])
    .map((cy) => {
      const open = opening[cy.id] ?? { full: 0, empty: 0, defective: 0 };
      const flows = dayCylinderFlows(day, cy.id);
      const close = applyStock(day, cy.id, open);
      return {
        cylinder: cy,
        openFull: open.full,
        openEmpty: open.empty,
        openDefective: open.defective,
        ...flows,
        closeFull: close.full,
        closeEmpty: close.empty,
        closeDefective: close.defective,
      };
    });

  return {
    day,
    refills,
    items,
    A,
    a,
    d,
    refillDue,
    refillQty: refills.reduce((acc, r) => acc + r.row.qty, 0),
    B,
    b,
    e,
    itemDue,
    C,
    c,
    f,
    connectionDue,
    newConnectionCount: day.connections.filter((x) => x.kind === 'new').length,
    tvInCount: day.connections.filter((x) => x.kind === 'tvin').length,
    R,
    D,
    finalPaise,
    onlinePaise: a + b + c,
    cashPaise,
    duePaise: refillDue + itemDue + connectionDue,
    cashInHandPaise: cashPaise - R - D,
    finalBalancePaise: finalPaise + day.currentAccountPaise + day.edfsAccountPaise,
    stock,
    hasError: refills.some((r) => r.error) || items.some((r) => r.error) || stock.some((s) => s.closeFull < 0 || s.closeEmpty < 0 || s.closeDefective < 0),
  };
}

/* ---------------- sample: the client's handwritten page (24/10/2018) ---------------- */

export function sampleLpg(): { settings: LpgSettings; days: Record<string, LpgDay> } {
  const settings = defaultLpgSettings();
  settings.businessName = 'Demo LPG Agency';
  settings.cylinders[0].refillRatePaise = 44200;
  settings.cylinders[0].openingFull = 1050;
  settings.cylinders[0].openingEmpty = 120;
  settings.cylinders[0].openingDefective = 4;
  const date = '2018-10-24';
  const cost = (label: string, rupees: number): LineItem => ({ id: uid(), label, amountPaise: rupees * 100 });
  const day: LpgDay = {
    date,
    refills: {
      dom142: { ratePaise: 44200, qty: 928, onlinePaise: 0, duePaise: 649600 },
      dom5: blankRow(settings.cylinders[1].refillRatePaise),
      com19: blankRow(settings.cylinders[2].refillRatePaise),
    },
    items: Object.fromEntries(settings.items.map((it) => [it.id, blankRow(it.ratePaise)])),
    connections: [
      { id: uid(), kind: 'new', cylinderId: 'dom142', amountPaise: 450000, mode: 'cash', note: '' },
      { id: uid(), kind: 'new', cylinderId: 'dom142', amountPaise: 270000, mode: 'cash', note: '' },
    ],
    refunds: [{ id: uid(), cylinderId: 'dom142', amountPaise: 83200, note: 'TV return' }],
    costs: [cost('Fuel (তেল)', 1100), cost('Labour (মজুরি)', 1300), cost('Rent (ভাড়া)', 1500)],
    stock: { dom142: { received: 612, emptySent: 600, defectiveFound: 0, defectiveSent: 0 } },
    currentAccountPaise: 0,
    edfsAccountPaise: 0,
    remark: '',
    locked: false,
    updatedAt: new Date().toISOString(),
  };
  return { settings, days: { [date]: day } };
}
