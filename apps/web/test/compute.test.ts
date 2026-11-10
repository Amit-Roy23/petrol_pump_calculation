import { describe, it, expect } from 'vitest';
import { computeDay, createDay, customerBalances, denominationTotal, paymentMethods } from '../src/lib/compute';
import { sampleData, emptyData } from '../src/lib/seed';
import { parseAmountExpr, splitAmounts } from '../src/lib/util';

describe('notebook page 19/06/2026', () => {
  const data = sampleData();
  const calc = computeDay(data, data.days['2026-06-19']);
  const [m219, m285] = calc.sheets;

  it('machine 219 matches the left page', () => {
    expect(m219.rows.map((r) => r.litresCenti)).toEqual([717, 11460, 982, 12958]);
    expect(m219.products.map((p) => [p.litresCenti, p.amountPaise])).toEqual([
      [12177, 1223179],
      [13940, 1591251],
    ]);
    expect(m219.salePaise).toBe(2814430);
    expect(m219.onlinePaise).toBe(528200);
    expect(m219.collectedPaise).toBe(2814000);
    expect(m219.diffPaise).toBe(-430);
  });

  it('machine 285 matches the right page', () => {
    expect(m285.products.map((p) => [p.litresCenti, p.amountPaise])).toEqual([
      [48182, 4839881],
      [11143, 1271973],
    ]);
    expect(m285.salePaise).toBe(6111854);
    expect(m285.onlinePaise).toBe(577500);
    expect(m285.collectedPaise).toBe(6111100);
    expect(m285.diffPaise).toBe(-754);
  });

  it('day closing balances the cash drawer', () => {
    expect(calc.totalOnlinePaise).toBe(1105700);
    expect(calc.expectedCashPaise).toBe(6646000);
    expect(calc.countedCashPaise).toBe(6646000);
    expect(calc.cashDiffPaise).toBe(0);
  });

  it('tracks the due customer balance', () => {
    const b = [...customerBalances(data).values()][0];
    expect(b.balancePaise).toBe(1145100);
  });

  it('carries closing readings forward as next day openings', () => {
    const next = createDay(data, '2026-06-20');
    expect(next.sheets.m219.readings['m219-n1'].opening).toBe('2127216.665');
    expect(next.sheets.m285.readings['m285-n4'].opening).toBe('270788.978');
  });

  it('flags closing below opening as an error', () => {
    const d = structuredClone(data);
    d.days['2026-06-19'].sheets.m219.readings['m219-n1'].closing = '2127200.000';
    const c = computeDay(d, d.days['2026-06-19']);
    expect(c.sheets[0].rows[0].status).toBe('error');
    expect(c.sheets[0].hasError).toBe(true);
  });
});

describe('input helpers', () => {
  it('parses notebook style amounts', () => {
    expect(parseAmountExpr('22,525')).toBe(2252500);
    expect(parseAmountExpr('1160+114+500')).toBe(177400);
    expect(parseAmountExpr('500x92')).toBe(4600000);
    expect(parseAmountExpr('abc')).toBeNull();
    expect(splitAmounts('1160 + 114+500')).toEqual([116000, 11400, 50000]);
  });

  it('counts denominations including coins', () => {
    expect(denominationTotal({ '500': 92, '200': 35, '100': 133, '20': 6, '10': 4 })).toBe(6646000);
    expect(denominationTotal({ coins: 12.5 })).toBe(1250);
  });

  it('new station without history leaves openings blank', () => {
    const d = createDay(emptyData(), '2026-01-01');
    expect(d.sheets.m219.readings['m219-n1'].opening).toBe('');
  });
});

describe('extra payment methods (PPM, PPS)', () => {
  it('count toward collected but not toward cash in the drawer', () => {
    const data = sampleData();
    const day = data.days['2026-06-19'];
    day.sheets.m219.extra = { ppm: [{ id: 'a', amountPaise: 300 }], pps: [{ id: 'b', amountPaise: 130 }] };
    const calc = computeDay(data, day);
    const m219 = calc.sheets[0];
    expect(m219.extraPaise).toEqual({ ppm: 300, pps: 130 });
    expect(m219.collectedPaise).toBe(2814430);
    expect(m219.diffPaise).toBe(0); // the ₹4.30 short is now covered
    expect(calc.extraTotalPaise).toBe(430);
    expect(calc.expectedCashPaise).toBe(6646000); // unchanged – not cash
  });

  it('older saved data without the new fields still works and gets PPM/PPS', () => {
    const data = sampleData();
    delete data.settings.paymentMethods;
    for (const s of Object.values(data.days['2026-06-19'].sheets)) delete s.extra;
    const calc = computeDay(data, data.days['2026-06-19']);
    expect(calc.sheets[0].diffPaise).toBe(-430);
    expect(calc.extraTotalPaise).toBe(0);
    expect(paymentMethods(data.settings).map((m) => m.name)).toEqual(['PPM', 'PPS']);
  });
});
