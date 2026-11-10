import { Decimal } from 'decimal.js';
import { calculateNozzleLitres, calculateProductTotals, RoundingMode } from '@petrolpump/shared';
import { defaultPaymentMethods } from './seed';
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
} from './types';
import { isValidReading, sumPaise } from './util';

/** A single nozzle dispensing more than this in one day is almost certainly a typo. */
export const SUSPICIOUS_LITRES = 5000;

export const NOTE_VALUES = ['2000', '500', '200', '100', '50', '20', '10', '5', '2', '1'] as const;

/** Station's extra payment methods; older saved data gets the defaults (PPM, PPS). */
export function paymentMethods(settings: Settings): PaymentMethod[] {
  return settings.paymentMethods ?? defaultPaymentMethods();
}

/** Methods to show on a sheet: active ones, plus any inactive one that already has slips. */
export function visibleMethods(settings: Settings, sheets: MachineSheet[]): PaymentMethod[] {
  return paymentMethods(settings).filter((m) => m.active || sheets.some((s) => (s.extra?.[m.id]?.length ?? 0) > 0));
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

export interface SheetCalc {
  machine: Machine;
  sheet: MachineSheet;
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
      const r = sheet.readings[nozzle.id];
      if (r && isValidReading(r.closing)) return r.closing.trim();
    }
  }
  return nozzle.initialReading;
}

export function emptySheet(machine: Machine): MachineSheet {
  return {
    machineId: machine.id,
    attendant: machine.attendant,
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
    for (const n of m.nozzles) {
      sheet.readings[n.id] = { opening: previousClosing(data, date, n), closing: '', testing: '' };
    }
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

function computeRow(data: AppData, day: DayRecord, nozzle: NozzleConfig, reading: NozzleReading, settings: Settings): NozzleRow {
  const product = settings.products.find((p) => p.id === nozzle.productId);
  const row: NozzleRow = { nozzle, product, reading, status: 'empty', litresCenti: 0 };

  const expected = previousClosing(data, day.date, nozzle);
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

export function computeSheet(data: AppData, day: DayRecord, machine: Machine): SheetCalc {
  const settings = data.settings;
  const sheet = day.sheets[machine.id] ?? emptySheet(machine);
  const rows = machine.nozzles.map((n) =>
    computeRow(data, day, n, sheet.readings[n.id] ?? { opening: n.initialReading, closing: '', testing: '' }, settings)
  );

  // Product subtotal per machine, rounded per the station's notebook rule.
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
  const products: ProductLine[] = usedProducts.map((p) => {
    const t = totals.find((x) => x.productId === p.id);
    return {
      product: p,
      litresCenti: t?.litresCenti ?? 0,
      ratePaise: day.rates[p.id] ?? p.ratePaise,
      amountPaise: t?.amountPaise ?? 0,
    };
  });

  const salePaise = products.reduce((a, b) => a + b.amountPaise, 0);
  const onlinePaise = sumPaise(sheet.online);
  const cardPaise = sumPaise(sheet.card);
  const duePaise = sumPaise(sheet.dues);
  const extraPaise: Record<string, number> = {};
  for (const [id, entries] of Object.entries(sheet.extra ?? {})) extraPaise[id] = sumPaise(entries);
  const extraTotalPaise = Object.values(extraPaise).reduce((a, b) => a + b, 0);
  const collectedPaise = sheet.cashPaise + onlinePaise + cardPaise + duePaise + extraTotalPaise;
  const filledNozzles = rows.filter((r) => r.status === 'ok').length;

  return {
    machine,
    sheet,
    rows,
    products,
    salePaise,
    cashPaise: sheet.cashPaise,
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
      for (const d of sheet.dues) {
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
      for (const d of sheet.dues) {
        if (d.customerId === customerId) lines.push({ date: day.date, kind: 'sale', amountPaise: d.amountPaise, note: d.note ?? '', machine });
      }
    }
  }
  for (const r of data.receipts) {
    if (r.customerId === customerId) lines.push({ date: r.date, kind: 'receipt', amountPaise: r.amountPaise, note: r.note || r.mode });
  }
  return lines.sort((a, b) => a.date.localeCompare(b.date));
}

export { RoundingMode };
