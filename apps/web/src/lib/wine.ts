import type { AppData, WineDay, WineProduct, WineRow, WineSettings } from './types';
import { sumPaise, uid } from './util';

export const WINE_CATEGORIES = ['Whisky', 'Rum', 'Vodka', 'Brandy', 'Gin', 'Beer', 'Wine', 'Country liquor', 'Other'];

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
  for (const p of wineSettings(data).products) if (p.active) rows[p.id] = { mrpPaise: p.mrpPaise, received: 0, breakage: 0, closing: '' };
  return { date, rows, online: [], card: [], dues: [], expenses: [], cashCountedPaise: 0, remark: '', locked: false, updatedAt: new Date().toISOString() };
}

const isCount = (s: string) => /^\d+$/.test(s.trim());

/** Closing stock after a day: the count if entered, otherwise nothing sold. */
function closingOf(open: number, row: WineRow | undefined): number {
  if (!row) return open;
  const available = open + row.received - row.breakage;
  return isCount(row.closing) ? Number(row.closing) : available;
}

/** Stock of every product at the end of every recorded day, in date order. */
function ledger(data: AppData): Map<string, Record<string, number>> {
  const products = wineSettings(data).products;
  const days = wineDays(data);
  const out = new Map<string, Record<string, number>>();
  let cur: Record<string, number> = Object.fromEntries(products.map((p) => [p.id, p.openingStock]));
  for (const date of Object.keys(days).sort()) {
    const next: Record<string, number> = {};
    for (const p of products) next[p.id] = closingOf(cur[p.id] ?? 0, days[date].rows[p.id]);
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
  salePaise: number;
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
    .filter((p) => p.active || day.rows[p.id])
    .map((p) => {
      const row = day.rows[p.id] ?? { mrpPaise: p.mrpPaise, received: 0, breakage: 0, closing: '' };
      const open = opening[p.id] ?? p.openingStock;
      const available = open + row.received - row.breakage;
      const counted = isCount(row.closing);
      const closing = counted ? Number(row.closing) : available;
      const error = closing > available || available < 0;
      const sold = error ? 0 : available - closing;
      return {
        product: p,
        row,
        opening: open,
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
  const onlinePaise = sumPaise(day.online);
  const cardPaise = sumPaise(day.card);
  const duePaise = sumPaise(day.dues);
  const expensesPaise = sumPaise(day.expenses);
  const expectedCashPaise = salePaise - onlinePaise - cardPaise - duePaise - expensesPaise;
  return {
    day,
    rows,
    bottlesSold: rows.reduce((a, r) => a + r.sold, 0),
    bottlesReceived: rows.reduce((a, r) => a + r.row.received, 0),
    bottlesBroken: rows.reduce((a, r) => a + r.row.breakage, 0),
    countedRows: rows.filter((r) => r.counted).length,
    salePaise,
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
