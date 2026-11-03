import { Decimal } from 'decimal.js';
import { formatIndianNumber } from '@petrolpump/shared';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

/** ₹ formatted with Indian grouping: 2814430 -> "₹28,144.30" */
export function rupee(paise: number, opts: { sign?: boolean; symbol?: boolean } = {}) {
  const { sign = false, symbol = true } = opts;
  const abs = formatIndianNumber(new Decimal(Math.abs(paise)).dividedBy(100), 2);
  const prefix = paise < 0 ? '−' : sign && paise > 0 ? '+' : '';
  return `${prefix}${symbol ? '₹' : ''}${abs}`;
}

export function litresFmt(centi: number) {
  return formatIndianNumber(new Decimal(centi).dividedBy(100), 2);
}

export function paiseToInput(paise: number): string {
  if (!paise) return '';
  const d = new Decimal(paise).dividedBy(100);
  return d.isInteger() ? d.toFixed(0) : d.toFixed(2);
}

/**
 * Parses what an attendant would scribble in the notebook:
 *  "22525", "1,160", "1160+114+500", "500x92" -> paise.
 * Returns null when it can't be read.
 */
export function parseAmountExpr(raw: string): number | null {
  const s = raw.replace(/[₹,\s]/g, '').replace(/[×*xX]/g, '*');
  if (!s) return 0;
  if (!/^[0-9.+\-*]+$/.test(s)) return null;
  const terms = s.split(/(?=[+-])/);
  let total = new Decimal(0);
  for (const term of terms) {
    if (!term || term === '+' || term === '-') return null;
    const sign = term.startsWith('-') ? -1 : 1;
    const body = term.replace(/^[+-]/, '');
    const factors = body.split('*');
    let prod = new Decimal(1);
    for (const f of factors) {
      if (!/^\d*\.?\d+$|^\d+\.$/.test(f)) return null;
      prod = prod.times(f);
    }
    total = total.plus(prod.times(sign));
  }
  return total.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Split "1160+114+500" into separate amounts in paise (used for P.T.M lists). */
export function splitAmounts(raw: string): number[] | null {
  const parts = raw.split(/[+\n;]/).map((p) => p.trim()).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const v = parseAmountExpr(p);
    if (v === null || v <= 0) return null;
    out.push(v);
  }
  return out;
}

export function isValidReading(s: string) {
  return /^\d+(\.\d{0,3})?$/.test(s.trim());
}

export const todayISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

export function shiftDate(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dateLabel(iso: string, lang: 'en' | 'bn' = 'en', style: 'long' | 'short' = 'long') {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(lang === 'bn' ? 'bn-IN' : 'en-IN', {
    weekday: style === 'long' ? 'short' : undefined,
    day: '2-digit',
    month: 'short',
    year: style === 'long' ? 'numeric' : undefined,
  });
}

export function sumPaise(items: { amountPaise: number }[]) {
  return items.reduce((a, b) => a + b.amountPaise, 0);
}

export function downloadFile(name: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
