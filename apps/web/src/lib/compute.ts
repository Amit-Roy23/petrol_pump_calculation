import { Decimal } from 'decimal.js';
import { calculateNozzleLitres, calculateProductTotals, RoundingMode } from '@petrolpump/shared';
import { defaultPaymentMethods, defaultShiftTemplates } from './seed';
import type {
  AppData,
  PaymentMethod,
  DayRecord,
  Machine,
  MachineSheet,
  NozzleConfig,
  NozzleReading,
  Product,
  Settings,
  ShiftSheet,
  ShiftTemplate,
  Staff,
  Entry,
} from './types';
import { isValidReading, sumPaise, uid } from './util';

/** A single nozzle dispensing more than this in one day is almost certainly a typo. */
export const SUSPICIOUS_LITRES = 5000;

export const NOTE_VALUES = ['2000', '500', '200', '100', '50', '20', '10', '5', '2', '1'] as const;

/** Station's extra payment methods; older saved data gets the defaults (PPM, PPS). */
export function paymentMethods(settings: Settings): PaymentMethod[] {
  return settings.paymentMethods ?? defaultPaymentMethods();
}

/** Methods to show on a sheet: active ones, plus any inactive one that already has slips. */
export function visibleMethods(settings: Settings, sheets: { extra?: Record<string, Entry[]> }[]): PaymentMethod[] {
  return paymentMethods(settings).filter((m) => m.active || sheets.some((s) => (s.extra?.[m.id]?.length ?? 0) > 0));
}

export function staffList(settings: Settings): Staff[] {
  return settings.staff ?? [];
}

export function shiftTemplates(settings: Settings): ShiftTemplate[] {
  return settings.shiftTemplates ?? defaultShiftTemplates();
}

const blankReading = (): NozzleReading => ({ opening: '', closing: '', testing: '' });

/** Reads a pre-shift (single sheet) machine record as its one shift. */
function legacyShift(sheet: MachineSheet): ShiftSheet {
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
    remark: sheet.remark ?? '',
  };
}

/** The shifts of a machine's day (older data shows as a single shift). */
export function getShifts(sheet: MachineSheet): ShiftSheet[] {
  return sheet.shifts && sheet.shifts.length ? sheet.shifts : [legacyShift(sheet)];
}

/** Moves older single-sheet data into `shifts` so it can be edited. Mutates. */
export function ensureShifts(sheet: MachineSheet): ShiftSheet[] {
  if (!sheet.shifts || !sheet.shifts.length) {
    sheet.shifts = [legacyShift(sheet)];
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

export function newShift(settings: Settings, machine: Machine, index: number, openings: Record<string, string>): ShiftSheet {
  const tpl = shiftTemplates(settings)[index];
  const readings: Record<string, NozzleReading> = {};
  for (const n of machine.nozzles) readings[n.id] = { opening: openings[n.id] ?? '', closing: '', testing: '' };
  return {
    id: uid(),
    templateId: tpl?.id ?? '',
    label: tpl?.name ?? '',
    start: tpl?.start ?? '',
    end: tpl?.end ?? '',
    staffId: '',
    attendant: '',
    readings,
    cashPaise: 0,
    online: [],
    card: [],
    dues: [],
    extra: {},
    remark: '',
  };
}

/** Appends the next shift; its openings are the previous shift's closings. Mutates. */
export function addShift(settings: Settings, sheet: MachineSheet, machine: Machine): ShiftSheet {
  const shifts = ensureShifts(sheet);
  // Splitting an untimed day: the first shift becomes the first timing (e.g. Morning).
  const first = shifts[0];
  const tpl0 = shiftTemplates(settings)[0];
  if (shifts.length === 1 && first && !first.templateId && !first.label && tpl0) {
    first.templateId = tpl0.id;
    first.label = tpl0.name;
    first.start ||= tpl0.start;
    first.end ||= tpl0.end;
  }
  const last = shifts[shifts.length - 1];
  const openings: Record<string, string> = {};
  for (const n of machine.nozzles) {
    const c = last?.readings[n.id]?.closing ?? '';
    openings[n.id] = isValidReading(c) ? c.trim() : '';
  }
  const shift = newShift(settings, machine, shifts.length, openings);
  shifts.push(shift);
  return shift;
}

/**
 * Sets one reading. Changing a shift's closing also updates the next shift's
 * opening when that opening was blank or still equal to the old closing. Mutates.
 */
export function setShiftReading(sheet: MachineSheet, shiftIndex: number, nozzleId: string, field: keyof NozzleReading, value: string) {
  const shifts = ensureShifts(sheet);
  const sh = shifts[shiftIndex];
  if (!sh) return;
  const cur = sh.readings[nozzleId] ?? blankReading();
  sh.readings[nozzleId] = { ...cur, [field]: value };
  if (field !== 'closing') return;
  const next = shifts[shiftIndex + 1];
  if (!next) return;
  const nr = next.readings[nozzleId] ?? blankReading();
  if (!nr.opening.trim() || nr.opening.trim() === cur.closing.trim()) next.readings[nozzleId] = { ...nr, opening: value };
}

/** Worker name for a shift: the staff record if linked, else the typed name. */
export function shiftStaffName(settings: Settings, shift: ShiftSheet): string {
  const st = shift.staffId ? staffList(settings).find((x) => x.id === shift.staffId) : undefined;
  return st?.name ?? shift.attendant.trim();
}

export function shiftDisplayLabel(settings: Settings, shift: ShiftSheet, index: number): string {
  const lang = settings.language;
  const tpl = shiftTemplates(settings).find((x) => x.id === shift.templateId);
  const name = tpl ? (lang === 'bn' && tpl.nameBn ? tpl.nameBn : tpl.name) : shift.label;
  return name || `${lang === 'bn' ? 'শিফট' : 'Shift'} ${index + 1}`;
}

export type RowStatus = 'empty' | 'ok' | 'error';

export interface NozzleRow {
  nozzle: NozzleConfig;
  product: Product | undefined;
  reading: NozzleReading;
  status: RowStatus;
  error?: 'closingLess' | 'invalid' | 'testingTooHigh';
  warning?: 'carryMismatch' | 'bigJump';
  expectedOpening?: string;
  litresCenti: number;
}

export interface ProductLine {
  product: Product;
  litresCenti: number;
  ratePaise: number;
  amountPaise: number;
}

/** Money + litres for one shift (or, aggregated, for a whole machine). */
interface CalcCore {
  rows: NozzleRow[];
  products: ProductLine[];
  salePaise: number;
  cashPaise: number;
  onlinePaise: number;
  cardPaise: number;
  duePaise: number;
  extraPaise: Record<string, number>;
  extraTotalPaise: number;
  collectedPaise: number;
  diffPaise: number;
  filledNozzles: number;
  hasError: boolean;
  complete: boolean;
}

export interface ShiftCalc extends CalcCore {
  shift: ShiftSheet;
  index: number;
  staffName: string;
  label: string;
}

export interface SheetCalc {
  machine: Machine;
  sheet: MachineSheet;
  /** One entry per worker shift; machine figures below are their sum. */
  shifts: ShiftCalc[];
  rows: NozzleRow[];
  products: ProductLine[];
  salePaise: number;
  cashPaise: number;
  onlinePaise: number;
  cardPaise: number;
  duePaise: number;
  /** PaymentMethod.id → paise for the extra methods (PPM, PPS …). */
  extraPaise: Record<string, number>;
  extraTotalPaise: number;
  collectedPaise: number;
  /** collected − sale. Negative = short, positive = excess. */
  diffPaise: number;
  filledNozzles: number;
  hasError: boolean;
  complete: boolean;
}

export interface DayCalc {
  day: DayRecord;
  sheets: SheetCalc[];
  products: ProductLine[];
  litresCenti: number;
  salePaise: number;
  cashPaise: number;
  onlinePaise: number;
  cardPaise: number;
  duePaise: number;
  extraPaise: Record<string, number>;
  extraTotalPaise: number;
  collectedPaise: number;
  diffPaise: number;
  receiptsCashPaise: number;
  receiptsOnlinePaise: number;
  otherCashPaise: number;
  expensesPaise: number;
  /** Cash that should physically be in the drawer. */
  expectedCashPaise: number;
  countedCashPaise: number;
  /** counted − expected. */
  cashDiffPaise: number;
  /** All digital money: P.T.M/UPI from sheets + due received online. */
  totalOnlinePaise: number;
  denominationsEntered: boolean;
  complete: boolean;
  hasError: boolean;
}

export function sortedDates(data: AppData) {
  return Object.keys(data.days).sort();
}

/** Closing reading of the most recent earlier day for that nozzle (carry forward). */
export function previousClosing(data: AppData, date: string, nozzle: NozzleConfig): string {
  const dates = sortedDates(data).filter((d) => d < date).reverse();
  for (const d of dates) {
    for (const sheet of Object.values(data.days[d].sheets)) {
      for (const shift of [...getShifts(sheet)].reverse()) {
        const r = shift.readings[nozzle.id];
        if (r && isValidReading(r.closing)) return r.closing.trim();
      }
    }
  }
  return nozzle.initialReading;
}

export function emptySheet(machine: Machine): MachineSheet {
  return {
    machineId: machine.id,
    shifts: [],
    attendant: '',
    readings: {},
    cashPaise: 0,
    online: [],
    card: [],
    dues: [],
    extra: {},
    remark: '',
  };
}

/** Builds a new day with openings carried forward and today's default rates. */
export function createDay(data: AppData, date: string): DayRecord {
  const rates: Record<string, number> = {};
  for (const p of data.settings.products) rates[p.id] = p.ratePaise;
  const sheets: Record<string, MachineSheet> = {};
  for (const m of data.settings.machines.filter((m) => m.active)) {
    const sheet = emptySheet(m);
    const openings: Record<string, string> = {};
    for (const n of m.nozzles) openings[n.id] = previousClosing(data, date, n);
    sheet.shifts = [newShift(data.settings, m, 0, openings)];
    sheets[m.id] = sheet;
  }
  return {
    date,
    rates,
    sheets,
    closing: { denominations: {}, otherCash: [], expenses: [] },
    locked: false,
    updatedAt: new Date().toISOString(),
  };
}

function computeRow(nozzle: NozzleConfig, reading: NozzleReading, settings: Settings, expected: string | undefined): NozzleRow {
  const product = settings.products.find((p) => p.id === nozzle.productId);
  const row: NozzleRow = { nozzle, product, reading, status: 'empty', litresCenti: 0 };

  if (expected && isValidReading(expected) && isValidReading(reading.opening) && !new Decimal(expected).eq(reading.opening)) {
    row.warning = 'carryMismatch';
    row.expectedOpening = expected;
  }

  if (!reading.closing.trim()) return row;
  if (!isValidReading(reading.opening) || !isValidReading(reading.closing) || (reading.testing.trim() && isNaN(Number(reading.testing)))) {
    return { ...row, status: 'error', error: 'invalid' };
  }
  if (new Decimal(reading.closing).lessThan(reading.opening)) {
    return { ...row, status: 'error', error: 'closingLess' };
  }
  try {
    const res = calculateNozzleLitres({
      productId: nozzle.productId,
      openingReading: reading.opening.trim(),
      closingReading: reading.closing.trim(),
      testingLitres: reading.testing.trim() || 0,
    });
    row.status = 'ok';
    row.litresCenti = res.litresCenti;
    if (res.litresCenti > SUSPICIOUS_LITRES * 100) row.warning = 'bigJump';
    return row;
  } catch {
    return { ...row, status: 'error', error: 'testingTooHigh' };
  }
}

function productLines(settings: Settings, day: DayRecord, machine: Machine, rows: NozzleRow[]): ProductLine[] {
  // Product subtotal, rounded per the station's notebook rule.
  const okRows = rows.filter((r) => r.status === 'ok' && r.product);
  const nozzleResults = okRows.map((r) => ({
    productId: r.nozzle.productId,
    openingReading: r.reading.opening,
    closingReading: r.reading.closing,
    testingLitres: '0',
    litres: new Decimal(r.litresCenti).dividedBy(100).toFixed(2),
    litresCenti: r.litresCenti,
  }));
  const usedProducts = settings.products.filter((p) => machine.nozzles.some((n) => n.productId === p.id));
  const totals = calculateProductTotals(
    nozzleResults,
    usedProducts.map((p) => ({ productId: p.id, ratePaise: day.rates[p.id] ?? p.ratePaise })),
    settings.roundingMode
  );
  return usedProducts.map((p) => {
    const t = totals.find((x) => x.productId === p.id);
    return { product: p, litresCenti: t?.litresCenti ?? 0, ratePaise: day.rates[p.id] ?? p.ratePaise, amountPaise: t?.amountPaise ?? 0 };
  });
}

function computeShift(data: AppData, day: DayRecord, machine: Machine, shift: ShiftSheet, index: number, prev: ShiftSheet | undefined): ShiftCalc {
  const settings = data.settings;
  const rows = machine.nozzles.map((n) => {
    // First shift continues from the previous day; later shifts from the shift before.
    const expected = prev ? prev.readings[n.id]?.closing : previousClosing(data, day.date, n);
    return computeRow(n, shift.readings[n.id] ?? { opening: prev ? '' : n.initialReading, closing: '', testing: '' }, settings, expected);
  });
  const products = productLines(settings, day, machine, rows);
  const salePaise = products.reduce((a, b) => a + b.amountPaise, 0);
  const onlinePaise = sumPaise(shift.online);
  const cardPaise = sumPaise(shift.card);
  const duePaise = sumPaise(shift.dues);
  const extraPaise: Record<string, number> = {};
  for (const [id, entries] of Object.entries(shift.extra ?? {})) extraPaise[id] = sumPaise(entries);
  const extraTotalPaise = Object.values(extraPaise).reduce((a, b) => a + b, 0);
  const collectedPaise = shift.cashPaise + onlinePaise + cardPaise + duePaise + extraTotalPaise;
  const filledNozzles = rows.filter((r) => r.status === 'ok').length;
  return {
    shift,
    index,
    staffName: shiftStaffName(settings, shift),
    label: shiftDisplayLabel(settings, shift, index),
    rows,
    products,
    salePaise,
    cashPaise: shift.cashPaise,
    onlinePaise,
    cardPaise,
    duePaise,
    extraPaise,
    extraTotalPaise,
    collectedPaise,
    diffPaise: collectedPaise - salePaise,
    filledNozzles,
    hasError: rows.some((r) => r.status === 'error'),
    complete: filledNozzles === rows.length && rows.length > 0,
  };
}

export function computeSheet(data: AppData, day: DayRecord, machine: Machine): SheetCalc {
  const sheet = day.sheets[machine.id] ?? createDay(data, day.date).sheets[machine.id] ?? emptySheet(machine);
  const shiftList = getShifts(sheet);
  const shifts = shiftList.map((sh, i) => computeShift(data, day, machine, sh, i, shiftList[i - 1]));

  // Machine view of each nozzle across all shifts: first opening → last closing.
  const rows: NozzleRow[] = machine.nozzles.map((n, i) => {
    const per = shifts.map((sc) => sc.rows[i]);
    const first = per[0];
    const lastClosing = [...per].reverse().find((r) => r.reading.closing.trim())?.reading.closing ?? '';
    const err = per.find((r) => r.status === 'error');
    return {
      nozzle: n,
      product: first?.product,
      reading: { opening: first?.reading.opening ?? '', closing: lastClosing, testing: '' },
      status: err ? 'error' : per.length && per.every((r) => r.status === 'ok') ? 'ok' : 'empty',
      error: err?.error,
      warning: per.find((r) => r.warning)?.warning,
      expectedOpening: per.find((r) => r.warning)?.expectedOpening,
      litresCenti: per.reduce((a, r) => a + r.litresCenti, 0),
    };
  });

  const productMap = new Map<string, ProductLine>();
  for (const sc of shifts) {
    for (const pl of sc.products) {
      const cur = productMap.get(pl.product.id);
      if (cur) {
        cur.litresCenti += pl.litresCenti;
        cur.amountPaise += pl.amountPaise;
      } else productMap.set(pl.product.id, { ...pl });
    }
  }
  const products = [...productMap.values()];
  const sum = (k: keyof CalcCore) => shifts.reduce((a, sc) => a + (sc[k] as number), 0);
  const extraPaise: Record<string, number> = {};
  for (const sc of shifts) for (const [id, v] of Object.entries(sc.extraPaise)) extraPaise[id] = (extraPaise[id] ?? 0) + v;
  const salePaise = sum('salePaise');
  const collectedPaise = sum('collectedPaise');
  const filledNozzles = rows.filter((r) => r.status === 'ok').length;

  return {
    machine,
    sheet,
    shifts,
    rows,
    products,
    salePaise,
    cashPaise: sum('cashPaise'),
    onlinePaise: sum('onlinePaise'),
    cardPaise: sum('cardPaise'),
    duePaise: sum('duePaise'),
    extraPaise,
    extraTotalPaise: sum('extraTotalPaise'),
    collectedPaise,
    diffPaise: collectedPaise - salePaise,
    filledNozzles,
    hasError: shifts.some((sc) => sc.hasError),
    complete: shifts.length > 0 && shifts.every((sc) => sc.complete),
  };
}

export function denominationTotal(denoms: Record<string, number>) {
  let total = 0;
  for (const [note, count] of Object.entries(denoms)) {
    if (!count) continue;
    total += note === 'coins' ? Math.round(count * 100) : Number(note) * count * 100;
  }
  return total;
}

export function sheetMachines(data: AppData, day: DayRecord): Machine[] {
  // Machines that are active, plus any inactive machine that already has a sheet that day.
  return data.settings.machines.filter((m) => m.active || day.sheets[m.id]);
}

export function computeDay(data: AppData, day: DayRecord): DayCalc {
  const sheets = sheetMachines(data, day).map((m) => computeSheet(data, day, m));

  const productMap = new Map<string, ProductLine>();
  for (const s of sheets) {
    for (const pl of s.products) {
      const cur = productMap.get(pl.product.id);
      if (cur) {
        cur.litresCenti += pl.litresCenti;
        cur.amountPaise += pl.amountPaise;
      } else productMap.set(pl.product.id, { ...pl });
    }
  }
  const products = data.settings.products.map((p) => productMap.get(p.id)).filter(Boolean) as ProductLine[];

  const add = (k: keyof SheetCalc) => sheets.reduce((a, s) => a + (s[k] as number), 0);
  const salePaise = add('salePaise');
  const cashPaise = add('cashPaise');
  const onlinePaise = add('onlinePaise');
  const cardPaise = add('cardPaise');
  const duePaise = add('duePaise');
  const collectedPaise = add('collectedPaise');
  const extraTotalPaise = add('extraTotalPaise');
  const extraPaise: Record<string, number> = {};
  for (const s of sheets) for (const [id, v] of Object.entries(s.extraPaise)) extraPaise[id] = (extraPaise[id] ?? 0) + v;

  const receipts = data.receipts.filter((r) => r.date === day.date);
  const receiptsCashPaise = sumPaise(receipts.filter((r) => r.mode === 'cash'));
  const receiptsOnlinePaise = sumPaise(receipts.filter((r) => r.mode === 'online'));
  const otherCashPaise = sumPaise(day.closing.otherCash);
  const expensesPaise = sumPaise(day.closing.expenses);
  const expectedCashPaise = cashPaise + receiptsCashPaise + otherCashPaise - expensesPaise;
  const countedCashPaise = denominationTotal(day.closing.denominations);

  return {
    day,
    sheets,
    products,
    litresCenti: products.reduce((a, b) => a + b.litresCenti, 0),
    salePaise,
    cashPaise,
    onlinePaise,
    cardPaise,
    duePaise,
    extraPaise,
    extraTotalPaise,
    collectedPaise,
    diffPaise: collectedPaise - salePaise,
    receiptsCashPaise,
    receiptsOnlinePaise,
    otherCashPaise,
    expensesPaise,
    expectedCashPaise,
    countedCashPaise,
    cashDiffPaise: countedCashPaise - expectedCashPaise,
    totalOnlinePaise: onlinePaise + receiptsOnlinePaise,
    denominationsEntered: countedCashPaise > 0,
    complete: sheets.length > 0 && sheets.every((s) => s.complete),
    hasError: sheets.some((s) => s.hasError),
  };
}

export interface CustomerBalance {
  customerId: string;
  salesPaise: number;
  receivedPaise: number;
  balancePaise: number;
  lastDate?: string;
}

export function customerBalances(data: AppData): Map<string, CustomerBalance> {
  const map = new Map<string, CustomerBalance>();
  for (const c of data.customers) {
    map.set(c.id, { customerId: c.id, salesPaise: 0, receivedPaise: 0, balancePaise: c.openingDuePaise });
  }
  for (const day of Object.values(data.days)) {
    for (const sheet of Object.values(day.sheets)) {
      for (const d of getShifts(sheet).flatMap((sh) => sh.dues)) {
        const b = d.customerId ? map.get(d.customerId) : undefined;
        if (!b) continue;
        b.salesPaise += d.amountPaise;
        b.balancePaise += d.amountPaise;
        if (!b.lastDate || day.date > b.lastDate) b.lastDate = day.date;
      }
    }
  }
  for (const r of data.receipts) {
    const b = map.get(r.customerId);
    if (!b) continue;
    b.receivedPaise += r.amountPaise;
    b.balancePaise -= r.amountPaise;
    if (!b.lastDate || r.date > b.lastDate) b.lastDate = r.date;
  }
  return map;
}

export type LedgerLine = { date: string; kind: 'sale' | 'receipt'; amountPaise: number; note: string; machine?: string };

export function customerLedger(data: AppData, customerId: string): LedgerLine[] {
  const lines: LedgerLine[] = [];
  for (const day of Object.values(data.days)) {
    for (const sheet of Object.values(day.sheets)) {
      const machine = data.settings.machines.find((m) => m.id === sheet.machineId)?.name;
      for (const d of getShifts(sheet).flatMap((sh) => sh.dues)) {
        if (d.customerId === customerId) lines.push({ date: day.date, kind: 'sale', amountPaise: d.amountPaise, note: d.note ?? '', machine });
      }
    }
  }
  for (const r of data.receipts) {
    if (r.customerId === customerId) lines.push({ date: r.date, kind: 'receipt', amountPaise: r.amountPaise, note: r.note || r.mode });
  }
  return lines.sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------------- staff attendance ---------------- */

export interface ShiftRecord {
  date: string;
  machineId: string;
  machineName: string;
  index: number;
  label: string;
  start: string;
  end: string;
  /** Staff id, or "name:<lowercase name>" for a typed name not in the staff list. */
  staffKey: string;
  staffName: string;
  litresCenti: number;
  salePaise: number;
  collectedPaise: number;
  diffPaise: number;
  complete: boolean;
  hasError: boolean;
}

export function staffKeyFor(settings: Settings, shift: ShiftSheet): string {
  if (shift.staffId && staffList(settings).some((x) => x.id === shift.staffId)) return shift.staffId;
  const name = shift.attendant.trim().toLowerCase();
  if (!name) return '';
  const match = staffList(settings).find((x) => x.name.trim().toLowerCase() === name);
  return match ? match.id : `name:${name}`;
}

/** Every recorded shift between two dates (inclusive), for attendance & performance. */
export function shiftRecords(data: AppData, from: string, to: string): ShiftRecord[] {
  const out: ShiftRecord[] = [];
  for (const date of sortedDates(data)) {
    if (date < from || date > to) continue;
    const calc = computeDay(data, data.days[date]);
    for (const s of calc.sheets) {
      for (const sc of s.shifts) {
        const touched = sc.filledNozzles > 0 || sc.collectedPaise > 0 || !!sc.staffName;
        if (!touched) continue;
        out.push({
          date,
          machineId: s.machine.id,
          machineName: s.machine.name,
          index: sc.index,
          label: sc.label,
          start: sc.shift.start,
          end: sc.shift.end,
          staffKey: staffKeyFor(data.settings, sc.shift),
          staffName: sc.staffName,
          litresCenti: sc.rows.reduce((a, r) => a + r.litresCenti, 0),
          salePaise: sc.salePaise,
          collectedPaise: sc.collectedPaise,
          diffPaise: sc.diffPaise,
          complete: sc.complete,
          hasError: sc.hasError,
        });
      }
    }
  }
  return out;
}

export { RoundingMode };
