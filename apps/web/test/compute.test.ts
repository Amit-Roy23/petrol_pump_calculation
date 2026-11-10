import { describe, it, expect } from 'vitest';
import {
  addShift,
  dayExpenseLines,
  computeDay,
  createDay,
  customerBalances,
  denominationTotal,
  ensureShifts,
  getShifts,
  paymentMethods,
  setShiftReading,
  shiftRecords,
} from '../src/lib/compute';
import { sampleData, emptyData } from '../src/lib/seed';
import { parseAmountExpr, splitAmounts } from '../src/lib/util';
import { computeLpgDay, createLpgDay, lpgOpeningStock, sampleLpg } from '../src/lib/lpg';

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
    expect(getShifts(next.sheets.m219)[0].readings['m219-n1'].opening).toBe('2127216.665');
    expect(getShifts(next.sheets.m285)[0].readings['m285-n4'].opening).toBe('270788.978');
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
    expect(getShifts(d.sheets.m219)[0].readings['m219-n1'].opening).toBe('');
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

describe('worker shifts', () => {
  /** Machine 219 of the sample day split into a morning and an evening shift. */
  function twoShiftDay() {
    const data = sampleData();
    const day = data.days['2026-06-19'];
    const sheet = day.sheets.m219;
    const machine = data.settings.machines[0];
    ensureShifts(sheet);
    // Morning shift ends part-way through N1/N2 and before N3/N4 moved.
    setShiftReading(sheet, 0, 'm219-n1', 'closing', '2127212.495');
    setShiftReading(sheet, 0, 'm219-n2', 'closing', '1566500.455');
    setShiftReading(sheet, 0, 'm219-n3', 'closing', '209343.220');
    setShiftReading(sheet, 0, 'm219-n4', 'closing', '440779.120');
    const evening = addShift(data.settings, sheet, machine);
    evening.staffId = 'st-bikash';
    return { data, day, sheet, machine, evening };
  }

  it('older single-sheet data reads as one shift with the typed attendant', () => {
    const data = sampleData();
    const sheet = data.days['2026-06-19'].sheets.m219;
    const shifts = getShifts(sheet);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].attendant).toBe('Ramesh');
    expect(computeDay(data, data.days['2026-06-19']).sheets[0].shifts[0].staffName).toBe('Ramesh');
  });

  it("a new shift opens at the previous shift's closing", () => {
    const { evening } = twoShiftDay();
    expect(evening.readings['m219-n1'].opening).toBe('2127212.495');
    expect(evening.readings['m219-n4'].opening).toBe('440779.120');
  });

  it("changing a shift's closing updates the next shift's opening", () => {
    const { sheet } = twoShiftDay();
    setShiftReading(sheet, 0, 'm219-n1', 'closing', '2127213.000');
    expect(sheet.shifts![1].readings['m219-n1'].opening).toBe('2127213.000');
  });

  it('machine totals are the sum of shifts and still match the notebook', () => {
    const { data, day, evening } = twoShiftDay();
    // Evening closes at the notebook's final readings.
    evening.readings['m219-n1'].closing = '2127216.665';
    evening.readings['m219-n2'].closing = '1566562.055';
    evening.readings['m219-n3'].closing = '209353.040';
    evening.readings['m219-n4'].closing = '440908.700';
    const m = computeDay(data, day).sheets[0];
    expect(m.shifts).toHaveLength(2);
    expect(m.shifts[0].rows.map((r) => r.litresCenti)).toEqual([300, 5300, 0, 0]);
    expect(m.shifts[1].rows.map((r) => r.litresCenti)).toEqual([417, 6160, 982, 12958]);
    expect(m.rows.map((r) => r.litresCenti)).toEqual([717, 11460, 982, 12958]);
    expect(m.products.map((p) => p.litresCenti)).toEqual([12177, 13940]);
    expect(m.complete).toBe(true);
  });

  it('money and short/excess are tracked per shift', () => {
    const { data, day, sheet, evening } = twoShiftDay();
    evening.readings['m219-n1'].closing = '2127216.665';
    evening.readings['m219-n2'].closing = '1566562.055';
    evening.readings['m219-n3'].closing = '209353.040';
    evening.readings['m219-n4'].closing = '440908.700';
    // The original money stays with the morning shift; give the evening ₹1,000 cash.
    evening.cashPaise = 100000;
    const m = computeDay(data, day).sheets[0];
    const [morning, eve] = m.shifts;
    expect(morning.collectedPaise).toBe(2814000);
    expect(eve.collectedPaise).toBe(100000);
    expect(morning.diffPaise + eve.diffPaise).toBe(m.diffPaise);
    expect(sheet.shifts![0].cashPaise).toBe(2252500);
  });

  it('next day carries forward from the last shift', () => {
    const { data, evening } = twoShiftDay();
    evening.readings['m219-n1'].closing = '2127216.665';
    const next = createDay(data, '2026-06-20');
    expect(getShifts(next.sheets.m219)[0].readings['m219-n1'].opening).toBe('2127216.665');
  });

  it('attendance records each worker shift', () => {
    const { data } = twoShiftDay();
    const recs = shiftRecords(data, '2026-06-01', '2026-06-30');
    const byName = recs.map((r) => [r.machineName, r.index, r.staffName, r.staffKey]);
    expect(byName).toEqual([
      ['219', 0, 'Ramesh', 'st-ramesh'],
      ['219', 1, 'Bikash', 'st-bikash'],
      ['285', 0, 'Suresh', 'st-suresh'],
    ]);
  });

  it('dues inside shifts still reach the customer balance', () => {
    const data = sampleData();
    ensureShifts(data.days['2026-06-19'].sheets.m285);
    expect([...customerBalances(data).values()][0].balancePaise).toBe(1145100);
  });
});

describe('expenses', () => {
  it('worker-paid expenses count as accounted for the shift, not as short', () => {
    const data = sampleData();
    const day = data.days['2026-06-19'];
    const sheet = day.sheets.m219;
    ensureShifts(sheet);
    // Machine 219 was ₹4.30 short; the worker had paid ₹4.30 for tea from the cash.
    sheet.shifts![0].expenses = [{ id: 'e1', label: 'Tea', amountPaise: 430 }];
    const calc = computeDay(data, day);
    expect(calc.sheets[0].shifts[0].shiftExpensesPaise).toBe(430);
    expect(calc.sheets[0].diffPaise).toBe(0);
    // Cash handed over is already net of it – expected drawer cash unchanged.
    expect(calc.expectedCashPaise).toBe(6646000);
    expect(calc.shiftExpensesPaise).toBe(430);
  });

  it('drawer expenses reduce expected cash; all expenses reduce the net', () => {
    const data = sampleData();
    const day = data.days['2026-06-19'];
    day.closing.expenses = [{ id: 'd1', label: 'Generator diesel', amountPaise: 50000 }];
    ensureShifts(day.sheets.m285).at(0)!.expenses = [{ id: 'e2', label: 'Repairs', amountPaise: 20000 }];
    const calc = computeDay(data, day);
    expect(calc.expectedCashPaise).toBe(6646000 - 50000);
    expect(calc.totalExpensesPaise).toBe(70000);
    expect(calc.netAfterExpensesPaise).toBe(8926284 - 70000);
    expect(dayExpenseLines(calc).map((l) => [l.label, l.source])).toEqual([
      ['Repairs', 'shift'],
      ['Generator diesel', 'drawer'],
    ]);
  });
});

describe('LPG – handwritten page 24/10/2018', () => {
  function lpgData() {
    const data = sampleData();
    const s = sampleLpg();
    data.settings.lpg = s.settings;
    data.lpgDays = s.days;
    return data;
  }

  it('reproduces the notebook net cash of ₹4,06,148', () => {
    const data = lpgData();
    const calc = computeLpgDay(data, data.lpgDays!['2018-10-24']);
    expect(calc.A).toBe(41017600); // 928 × 442
    expect(calc.C).toBe(720000); // 4500 + 2700
    expect(calc.A + calc.C).toBe(41737600); // 4,17,376
    expect(calc.R).toBe(83200);
    expect(calc.duePaise).toBe(649600);
    expect(calc.D).toBe(390000);
    expect(calc.cashInHandPaise).toBe(40614800); // 4,06,148 net cash
  });

  it('follows the printed form totals', () => {
    const data = lpgData();
    const day = data.lpgDays!['2018-10-24'];
    day.refills.dom142.onlinePaise = 100000; // ₹1,000 by PhonePe
    day.items.hose = { ratePaise: 19000, qty: 2, onlinePaise: 19000, duePaise: 0 };
    day.currentAccountPaise = 500000;
    day.edfsAccountPaise = 200000;
    const c = computeLpgDay(data, day);
    expect(c.B).toBe(38000);
    expect(c.onlinePaise).toBe(100000 + 19000); // a + b + c
    expect(c.cashPaise).toBe(c.d + c.e + c.f);
    expect(c.finalPaise).toBe(c.A + c.B + c.C - c.R - c.D);
    expect(c.finalBalancePaise).toBe(c.finalPaise + 500000 + 200000);
    expect(c.hasError).toBe(false);
  });

  it('tracks cylinder stock and carries it to the next day', () => {
    const data = lpgData();
    const c = computeLpgDay(data, data.lpgDays!['2018-10-24']);
    const dom = c.stock.find((s) => s.cylinder.id === 'dom142')!;
    // Full: 1050 + 612 received − 928 refills − 2 new connections
    expect(dom.closeFull).toBe(732);
    // Empty: 120 + 928 back from refills + 1 TV return − 600 sent
    expect(dom.closeEmpty).toBe(449);
    expect(dom.closeDefective).toBe(4);
    const next = lpgOpeningStock(data, '2018-10-25');
    expect(next.dom142).toEqual({ full: 732, empty: 449, defective: 4 });
  });

  it('flags online + due higher than the amount', () => {
    const data = lpgData();
    const day = createLpgDay(data, '2018-10-25');
    day.refills.dom142 = { ratePaise: 44200, qty: 1, onlinePaise: 50000, duePaise: 0 };
    expect(computeLpgDay(data, day).hasError).toBe(true);
  });
});
