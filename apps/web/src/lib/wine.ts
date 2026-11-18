import type { AppData, WineDay, WineInvoice, WineProduct, WineRow, WineSale, WineSettings } from './types';
import { sumPaise, uid } from './util';

/** Built-in categories offered in the Add brand dropdown. */
export const WINE_CATEGORIES = [
  'Whisky',
  'Scotch Whisky',
  'Single Malt',
  'Rum',
  'Vodka',
  'Brandy',
  'Gin',
  'Tequila',
  'Liqueur',
  'Wine',
  'Sparkling / Champagne',
  'Beer (Strong)',
  'Beer (Mild / Lager)',
  'Beer (Can)',
  'Breezer / RTD',
  'Country liquor',
  'Foreign liquor (IMFL)',
  'Other',
];

/** Dropdown options: built-in, the shop's own, and any already used by a brand. */
export function wineCategoryOptions(st: WineSettings): string[] {
  const out: string[] = [];
  for (const c of [...WINE_CATEGORIES, ...(st.customCategories ?? []), ...st.products.filter((p) => !p.deleted).map((p) => p.category)]) {
    const v = c.trim();
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
}

const product = (name: string, size: string, category: string, mrp: number, cost: number, opening: number, lowStock = 6): WineProduct => ({
  id: uid(),
  name,
  size,
  category,
  mrpPaise: mrp * 100,
  costPaise: cost * 100,
  openingStock: opening,
  lowStock,
  active: true,
});

export function defaultWineSettings(): WineSettings {
  return { shopName: 'Wine Shop', products: [] };
}

export function wineSettings(data: AppData): WineSettings {
  return data.settings.wine ?? defaultWineSettings();
}

export function wineDays(data: AppData): Record<string, WineDay> {
  return data.wineDays ?? {};
}

export function createWineDay(data: AppData, date: string): WineDay {
  const rows: Record<string, WineRow> = {};
  for (const p of wineSettings(data).products) if (p.active && !p.deleted) rows[p.id] = { mrpPaise: p.mrpPaise, received: 0, breakage: 0, closing: '' };
  return { date, rows, invoices: [], sales: [], online: [], card: [], dues: [], expenses: [], cashCountedPaise: 0, remark: '', locked: false, updatedAt: new Date().toISOString() };
}

const isCount = (s: string) => /^\d+$/.test(s.trim());

/** Bottles of a product received on invoices that day. */
export function invoiceQty(day: WineDay, productId: string): number {
  let n = 0;
  for (const inv of day.invoices ?? []) for (const l of inv.lines) if (l.productId === productId) n += l.qty;
  return n;
}

/** Bottles of a product sold on counter bills that day. */
export function billedQty(day: WineDay, productId: string): number {
  let n = 0;
  for (const s of day.sales ?? []) for (const l of s.lines) if (l.productId === productId) n += l.qty;
  return n;
}

export function saleTotal(s: WineSale): number {
  return s.lines.reduce((a, l) => a + l.qty * l.mrpPaise, 0);
}

/**
 * Closing stock after a day: the physical count if entered, otherwise
 * what's left after the counter bills.
 */
function closingOf(open: number, day: WineDay, productId: string): number {
  const row = day.rows[productId];
  const received = (row?.received ?? 0) + invoiceQty(day, productId);
  const available = open + received - (row?.breakage ?? 0);
  return row && isCount(row.closing) ? Number(row.closing) : available - billedQty(day, productId);
}

/** Stock of every product at the end of every recorded day, in date order. */
function ledger(data: AppData): Map<string, Record<string, number>> {
  const products = wineSettings(data).products;
  const days = wineDays(data);
  const out = new Map<string, Record<string, number>>();
  let cur: Record<string, number> = Object.fromEntries(products.map((p) => [p.id, p.openingStock]));
  for (const date of Object.keys(days).sort()) {
    const next: Record<string, number> = {};
    for (const p of products) next[p.id] = closingOf(cur[p.id] ?? 0, days[date], p.id);
    out.set(date, next);
    cur = next;
  }
  return out;
}

/** Opening stock for a date = closing of the last recorded day before it. */
export function wineOpeningStock(data: AppData, date: string): Record<string, number> {
  const l = ledger(data);
  const before = [...l.keys()].filter((d) => d < date).sort().pop();
  if (before) return l.get(before)!;
  return Object.fromEntries(wineSettings(data).products.map((p) => [p.id, p.openingStock]));
}

export interface WineRowCalc {
  product: WineProduct;
  row: WineRow;
  opening: number;
  /** Bottles received on invoices (on top of row.received typed by hand). */
  invoiceQty: number;
  /** All bottles received: typed + invoices. */
  receivedTotal: number;
  /** Bottles sold on counter bills. */
  billed: number;
  /** Bottles left on the shelf right now (count if entered, else available − billed). */
  inStock: number;
  /**
   * Counted sale minus billed: positive = bottles gone without a bill
   * (charged as cash), negative = count shows fewer sold than billed.
   */
  unbilled: number;
  /** opening + received − breakage. */
  available: number;
  counted: boolean;
  closing: number;
  sold: number;
  amountPaise: number;
  profitPaise: number;
  /** Closing count is higher than what was available. */
  error: boolean;
  low: boolean;
}

export interface WineDayCalc {
  day: WineDay;
  rows: WineRowCalc[];
  bottlesSold: number;
  bottlesReceived: number;
  bottlesBroken: number;
  countedRows: number;
  /** Counter bills made today and their total. */
  billCount: number;
  billedPaise: number;
  billedCashPaise: number;
  /** Bottles the count shows sold beyond the bills. */
  unbilledBottles: number;
  salePaise: number;
  /** Sale paid in cash: sale − online − card − due. */
  cashSalePaise: number;
  invoiceCount: number;
  invoiceBottles: number;
  invoiceAmountPaise: number;
  profitPaise: number;
  /** True when every sold product has a purchase cost. */
  hasCost: boolean;
  onlinePaise: number;
  cardPaise: number;
  duePaise: number;
  expensesPaise: number;
  /** Sale − online − card − due − expenses: what should be in the cash box. */
  expectedCashPaise: number;
  cashCountedPaise: number;
  /** counted − expected (negative = short). */
  cashDiffPaise: number;
  hasError: boolean;
}

export function computeWineDay(data: AppData, day: WineDay): WineDayCalc {
  const products = wineSettings(data).products;
  const opening = wineOpeningStock(data, day.date);
  const rows: WineRowCalc[] = products
    .filter((p) => (p.active && !p.deleted) || day.rows[p.id] || invoiceQty(day, p.id) || billedQty(day, p.id))
    .filter((p) => !p.deleted || (day.rows[p.id] && (day.rows[p.id].received || day.rows[p.id].breakage || day.rows[p.id].closing)) || invoiceQty(day, p.id) || billedQty(day, p.id))
    .map((p) => {
      const row = day.rows[p.id] ?? { mrpPaise: p.mrpPaise, received: 0, breakage: 0, closing: '' };
      const open = opening[p.id] ?? p.openingStock;
      const inv = invoiceQty(day, p.id);
      const receivedTotal = row.received + inv;
      const available = open + receivedTotal - row.breakage;
      const counted = isCount(row.closing);
      const billed = billedQty(day, p.id);
      const closing = counted ? Number(row.closing) : available - billed;
      const error = closing > available || available < 0 || (!counted && closing < 0);
      // Counted: sold = what left the shelf. Not counted: what was billed.
      const sold = error ? (counted ? 0 : billed) : available - closing;
      return {
        product: p,
        row,
        opening: open,
        invoiceQty: inv,
        receivedTotal,
        billed,
        inStock: closing,
        unbilled: counted ? sold - billed : 0,
        available,
        counted,
        closing,
        sold,
        amountPaise: sold * row.mrpPaise,
        profitPaise: sold * (row.mrpPaise - p.costPaise),
        error,
        low: p.lowStock > 0 && closing <= p.lowStock,
      };
    });
  const salePaise = rows.reduce((a, r) => a + r.amountPaise, 0);
  const sales = day.sales ?? [];
  const billByMode = (m: string) => sales.filter((x) => x.mode === m).reduce((a, x) => a + saleTotal(x), 0);
  const onlinePaise = sumPaise(day.online) + billByMode('online');
  const cardPaise = sumPaise(day.card) + billByMode('card');
  const duePaise = sumPaise(day.dues) + billByMode('due');
  const expensesPaise = sumPaise(day.expenses);
  const expectedCashPaise = salePaise - onlinePaise - cardPaise - duePaise - expensesPaise;
  return {
    day,
    rows,
    bottlesSold: rows.reduce((a, r) => a + r.sold, 0),
    bottlesReceived: rows.reduce((a, r) => a + r.receivedTotal, 0),
    bottlesBroken: rows.reduce((a, r) => a + r.row.breakage, 0),
    countedRows: rows.filter((r) => r.counted).length,
    billCount: sales.length,
    billedPaise: sales.reduce((a, x) => a + saleTotal(x), 0),
    billedCashPaise: billByMode('cash'),
    unbilledBottles: rows.reduce((a, r) => a + Math.max(0, r.unbilled), 0),
    salePaise,
    cashSalePaise: salePaise - onlinePaise - cardPaise - duePaise,
    invoiceCount: (day.invoices ?? []).length,
    invoiceBottles: (day.invoices ?? []).reduce((a, inv) => a + inv.lines.reduce((b, l) => b + l.qty, 0), 0),
    invoiceAmountPaise: (day.invoices ?? []).reduce((a, inv) => a + invoiceTotal(inv), 0),
    profitPaise: rows.reduce((a, r) => a + r.profitPaise, 0),
    hasCost: rows.filter((r) => r.sold > 0).every((r) => r.product.costPaise > 0),
    onlinePaise,
    cardPaise,
    duePaise,
    expensesPaise,
    expectedCashPaise,
    cashCountedPaise: day.cashCountedPaise,
    cashDiffPaise: day.cashCountedPaise - expectedCashPaise,
    hasError: rows.some((r) => r.error),
  };
}

export function invoiceTotal(inv: WineInvoice): number {
  return inv.lines.reduce((a, l) => a + l.qty * l.costPaise, 0);
}

/** Every invoice across all days, newest first. */
export function allInvoices(data: AppData): { date: string; invoice: WineInvoice }[] {
  const out: { date: string; invoice: WineInvoice }[] = [];
  for (const [date, day] of Object.entries(wineDays(data))) for (const invoice of day.invoices ?? []) out.push({ date, invoice });
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Products the shop works with (deleted ones hidden). */
export function liveProducts(st: WineSettings): WineProduct[] {
  return st.products.filter((p) => !p.deleted);
}

/** Has this product ever been used on a day (sale, count, breakage or invoice)? */
export function productUsed(data: AppData, productId: string): boolean {
  return Object.values(wineDays(data)).some((d) => {
    const r = d.rows[productId];
    return !!(r && (r.received || r.breakage || r.closing)) || invoiceQty(d, productId) > 0 || billedQty(d, productId) > 0;
  });
}

/* ---------------- sample shop ---------------- */

export function sampleWine(): { settings: WineSettings; days: Record<string, WineDay> } {
  const products = [
    product('Classic Whisky', '750 ml', 'Whisky', 820, 700, 48),
    product('Classic Whisky', '375 ml', 'Whisky', 420, 355, 60),
    product('Classic Whisky', '180 ml', 'Whisky', 210, 175, 120),
    product('Gold Rum', '750 ml', 'Rum', 650, 550, 36),
    product('Silver Vodka', '750 ml', 'Vodka', 780, 660, 24),
    product('Strong Beer', '650 ml', 'Beer', 180, 145, 144, 24),
    product('Lager Beer', '650 ml', 'Beer', 170, 138, 120, 24),
    product('Red Wine', '750 ml', 'Wine', 950, 780, 18, 4),
    product('Country Liquor', '600 ml', 'Country liquor', 160, 130, 96, 12),
  ];
  const [w750, w375, w180, rum, vodka, strong, lager, red, country] = products;
  const date = '2026-06-19';
  const row = (p: WineProduct, received: number, closing: number, breakage = 0): WineRow => ({ mrpPaise: p.mrpPaise, received, breakage, closing: String(closing) });
  const day: WineDay = {
    date,
    rows: {
      [w750.id]: row(w750, 0, 41),
      [w375.id]: row(w375, 0, 51),
      [w180.id]: row(w180, 48, 132),
      [rum.id]: row(rum, 0, 31),
      [vodka.id]: row(vodka, 0, 21),
      [strong.id]: row(strong, 96, 168, 2),
      [lager.id]: row(lager, 0, 98),
      [red.id]: row(red, 0, 16),
      [country.id]: row(country, 0, 80),
    },
    online: [3420, 1640, 820, 2100, 180].map((r) => ({ id: uid(), amountPaise: r * 100 })),
    card: [{ id: uid(), amountPaise: 190000 }],
    dues: [{ id: uid(), label: 'Hotel Sonar Bangla', amountPaise: 360000 }],
    expenses: [
      { id: uid(), label: 'Ice & cups', amountPaise: 25000 },
      { id: uid(), label: 'Helper wages', amountPaise: 40000 },
    ],
    cashCountedPaise: 0,
    remark: '',
    locked: false,
    updatedAt: new Date().toISOString(),
  };
  return { settings: { shopName: 'Demo Wine Shop', products }, days: { [date]: day } };
}
