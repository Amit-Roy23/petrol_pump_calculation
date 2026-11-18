import { describe, it, expect, beforeEach } from 'vitest';
import { memoryStore, type Store } from '../api/_lib/store';
import { petrolSave, petrolView, WorkError } from '../api/_lib/staffwork';
import { dataHandler } from '../api/_lib/handlers';
import { issueToken } from '../api/_lib/auth';
import { computeDay, createDay, customerBalances, getShifts, setShiftReading } from '../apps/web/src/lib/compute';
import { defaultSettings } from '../apps/web/src/lib/seed';
import type { AppData, DayRecord } from '../apps/web/src/lib/types';
import { Readable } from 'stream';

/*
 * End-to-end check of the petrol shift maths when staff fill in their own
 * shifts: what the server stores is run through the same calculation the
 * owner's app uses (meter sheet, day closing, dues, next day's openings).
 */

const NOW = new Date('2026-06-20T08:00:00Z');
const D0 = '2026-06-19';
const D = '2026-06-20';
const D1 = '2026-06-21';

const nozzles = {
  m1: [
    { id: 'm1-n1', label: 'N1', productId: 'petrol', initialReading: '1000.000' },
    { id: 'm1-n2', label: 'N2', productId: 'diesel', initialReading: '500.000' },
  ],
  m2: [{ id: 'm2-n1', label: 'N1', productId: 'petrol', initialReading: '2900.000' }],
};
const base = defaultSettings();
const settings = {
  ...base,
  stationName: 'Test',
  products: base.products, // Petrol ₹100.45, Diesel ₹114.15
  machines: [
    { id: 'm1', name: '219', attendant: '', active: true, nozzles: nozzles.m1 },
    { id: 'm2', name: '285', attendant: '', active: true, nozzles: nozzles.m2 },
  ],
  staff: [
    { id: 'st-r', name: 'Ramesh', phone: '', active: true },
    { id: 'st-s', name: 'Suresh', phone: '', active: true },
  ],
};
const R = { id: 'st-r', name: 'Ramesh' };
const S = { id: 'st-s', name: 'Suresh' };
const reading = (closing: string, testing = '') => ({ closing, testing });

async function ownerData(store: Store): Promise<AppData> {
  const s = await store.snapshot();
  return { version: 1, settings: s.settings as any, days: s.days as any, customers: s.customers as any, receipts: s.receipts as any };
}

function put(store: Store, body: unknown) {
  const req: any = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'PUT';
  req.url = '/';
  req.headers = { authorization: `Bearer ${issueToken().token}` };
  return new Promise<any>((resolve) => dataHandler(() => store)(req, { statusCode: 200, setHeader() {}, end: (x: string) => resolve(JSON.parse(x)) } as any));
}

describe('shift hand-over and the day maths', () => {
  let store: Store;
  beforeEach(async () => {
    process.env.MONGODB_URI = 'mongodb://example/fuel';
    process.env.APP_PASSWORD = 'secret-pass';
    store = memoryStore();
    await store.apply({
      settings,
      customers: [{ id: 'c1', name: 'Ghosh Transport', phone: '', vehicle: '', openingDuePaise: 0 }],
      days: [
        {
          date: D0,
          rates: { petrol: 10045, diesel: 11415 },
          sheets: {
            m1: { machineId: 'm1', attendant: 'Old', readings: { 'm1-n1': { opening: '1000.000', closing: '1100.000', testing: '' }, 'm1-n2': { opening: '500.000', closing: '550.000', testing: '' } }, cashPaise: 0, online: [], card: [], dues: [], remark: '' },
            m2: { machineId: 'm2', attendant: 'Old', readings: { 'm2-n1': { opening: '2900.000', closing: '3000.000', testing: '' } }, cashPaise: 0, online: [], card: [], dues: [], remark: '' },
          },
          closing: { denominations: {}, otherCash: [], expenses: [] },
          locked: true,
          updatedAt: '',
        },
      ],
    });
  });

  it('worker leaves without a closing → next worker enters the hand-over reading; no litre is counted twice', async () => {
    // Morning: Ramesh enters N1 only, some money, and leaves without submitting.
    await petrolSave(store, R, { date: D, machineId: 'm1', shift: { id: 'r', templateId: 'morning', readings: { 'm1-n1': reading('1150.500') } as any, cashPaise: 400000, online: [{ id: 'o', amountPaise: 100000 }] } }, NOW);

    // Evening: Suresh starts. N1 opens at Ramesh's closing; N2 is blank – read it off the meter.
    await petrolSave(store, S, { date: D, machineId: 'm1', shift: { id: 's', templateId: 'evening' } }, NOW);
    let day = (await store.day(D)) as any;
    expect(day.sheets.m1.shifts[1].readings['m1-n1'].opening).toBe('1150.500');
    expect(day.sheets.m1.shifts[1].readings['m1-n2'].opening).toBe(''); // NOT Ramesh's 500/550 opening

    // Suresh can't submit without that reading.
    await expect(petrolSave(store, S, { date: D, machineId: 'm1', submit: true, shift: { id: 's', readings: { 'm1-n1': reading('1200'), 'm1-n2': reading('600') } as any } }, NOW)).rejects.toBeInstanceOf(WorkError);

    // He enters it → it becomes Ramesh's missing closing too.
    await petrolSave(store, S, { date: D, machineId: 'm1', shift: { id: 's', readings: { 'm1-n2': { opening: '570.250', closing: '' } } as any } }, NOW);
    day = (await store.day(D)) as any;
    expect(day.sheets.m1.shifts[0].readings['m1-n2'].closing).toBe('570.250');

    // Ramesh comes back and tries other closings: the hand-over readings stay.
    await petrolSave(store, R, { date: D, machineId: 'm1', shift: { id: 'r', readings: { 'm1-n1': reading('1160'), 'm1-n2': reading('580') } as any, cashPaise: 400000, online: [{ id: 'o', amountPaise: 100000 }] } }, NOW);
    day = (await store.day(D)) as any;
    expect(day.sheets.m1.shifts[0].readings['m1-n1'].closing).toBe('1150.500');
    expect(day.sheets.m1.shifts[0].readings['m1-n2'].closing).toBe('570.250');

    // Suresh finishes: 2 L test on N1, due to Ghosh, tea from the cash.
    await petrolSave(
      store,
      S,
      {
        date: D,
        machineId: 'm1',
        submit: true,
        shift: { id: 's', readings: { 'm1-n1': reading('1200.000', '2'), 'm1-n2': reading('600.000') } as any, cashPaise: 750000, dues: [{ id: 'd', amountPaise: 50000, customerId: 'c1' }], expenses: [{ id: 'e', label: 'Tea', amountPaise: 5000 }] },
      },
      NOW
    );

    /* ---- the owner's app on the synced data ---- */
    const data = await ownerData(store);
    const calc = computeDay(data, data.days[D] as DayRecord);
    const m1 = calc.sheets.find((s) => s.machine.id === 'm1')!;
    const [r, s] = m1.shifts;

    // Ramesh: petrol 50.50 L × 100.45 = 5,072.72 (truncated) · diesel 20.25 L × 114.15 = 2,311.53
    expect(r.rows.map((x) => x.litresCenti)).toEqual([5050, 2025]);
    expect(r.products.map((p) => p.amountPaise)).toEqual([507272, 231153]);
    expect(r.salePaise).toBe(738425);
    expect(r.collectedPaise).toBe(500000);
    expect(r.diffPaise).toBe(-238425);

    // Suresh: petrol 49.50 − 2 test = 47.50 L = 4,771.37 · diesel 29.75 L = 3,395.96
    expect(s.rows.map((x) => x.litresCenti)).toEqual([4750, 2975]);
    expect(s.products.map((p) => p.amountPaise)).toEqual([477137, 339596]);
    expect(s.salePaise).toBe(816733);
    expect(s.collectedPaise).toBe(750000 + 50000 + 5000);
    expect(s.diffPaise).toBe(805000 - 816733);
    expect(s.shift.submittedBy).toBe('Suresh');

    // Machine = the two shifts; litres = last closing − first opening − test (no gap, no overlap).
    expect(m1.rows.map((x) => x.litresCenti)).toEqual([(1200 - 1100 - 2) * 100, (600 - 550) * 100]);
    expect(m1.salePaise).toBe(738425 + 816733);
    expect(m1.hasError).toBe(false);
    expect(m1.rows.every((x) => x.warning !== 'carryMismatch')).toBe(true);

    // Day: petrol & diesel totals, cash, expenses, short/excess.
    expect(calc.products.map((p) => [p.product.id, p.litresCenti, p.amountPaise])).toEqual([
      ['petrol', 9800, 507272 + 477137],
      ['diesel', 5000, 231153 + 339596],
    ]);
    expect(calc.salePaise).toBe(1555158);
    expect(calc.cashPaise).toBe(1150000);
    expect(calc.expectedCashPaise).toBe(1150000); // tea was paid before the cash was handed over
    expect(calc.shiftExpensesPaise).toBe(5000);
    expect(calc.netAfterExpensesPaise).toBe(1555158 - 5000);
    expect(calc.diffPaise).toBe(calc.collectedPaise - calc.salePaise);
    expect(calc.diffPaise).toBe(-238425 + -11733);

    // Due given on Suresh's shift shows in the customer's balance.
    expect(customerBalances(data).get('c1')!.balancePaise).toBe(50000);

    // Machine 285 wasn't used today: it isn't on the sheet and its reading carries to tomorrow.
    const next = createDay(data, D1);
    expect(getShifts(next.sheets.m1)[0].readings['m1-n1'].opening).toBe('1200.000');
    expect(getShifts(next.sheets.m1)[0].readings['m1-n2'].opening).toBe('600.000');
    expect(getShifts(next.sheets.m2)[0].readings['m2-n1'].opening).toBe('3000.000');

    // The staff phone sees the same carried openings for tomorrow.
    const view = await petrolView(store, R, D1, NOW);
    const phone: AppData = { version: 1, settings: { ...base, ...view.settings } as any, days: Object.fromEntries(view.previousDays.map((d: any) => [d.date, d])), customers: [], receipts: [] };
    expect(getShifts(createDay(phone, D1).sheets.m1)[0].readings['m1-n1'].opening).toBe('1200.000');
  });

  it("owner corrects a staff closing → the next shift's opening follows and totals stay continuous", async () => {
    await petrolSave(store, R, { date: D, machineId: 'm1', shift: { id: 'r', readings: { 'm1-n1': reading('1150'), 'm1-n2': reading('570') } as any } }, NOW);
    await petrolSave(store, S, { date: D, machineId: 'm1', shift: { id: 's', readings: { 'm1-n1': reading('1200'), 'm1-n2': reading('600') } as any } }, NOW);

    const data = await ownerData(store);
    const sheet = data.days[D].sheets.m1;
    setShiftReading(sheet, 0, 'm1-n1', 'closing', '1140'); // owner's correction
    expect(sheet.shifts![1].readings['m1-n1'].opening).toBe('1140');
    const res = await put(store, { days: [data.days[D]] });
    expect(res.ok).toBe(true);
    expect(res.merged).toBeUndefined(); // owner had the latest staff copy → owner wins

    const after = await ownerData(store);
    const m1 = computeDay(after, after.days[D]).sheets.find((s) => s.machine.id === 'm1')!;
    expect(m1.shifts.map((x) => x.rows[0].litresCenti)).toEqual([4000, 6000]);
    expect(m1.rows[0].litresCenti).toBe(10000);
  });

  it('nobody entered any closing → the next day opens blank instead of re-using an old reading', async () => {
    await petrolSave(store, R, { date: D, machineId: 'm1', shift: { id: 'r', cashPaise: 1000 } }, NOW);
    const data = await ownerData(store);
    const next = createDay(data, D1);
    expect(getShifts(next.sheets.m1)[0].readings['m1-n1'].opening).toBe('');
    // Server agrees: a new shift tomorrow opens blank too.
    await petrolSave(store, S, { date: D1, machineId: 'm1', shift: { id: 'x' } }, NOW);
    const d1 = (await store.day(D1)) as any;
    expect(d1.sheets.m1.shifts[0].readings['m1-n1'].opening).toBe('');
    // The owner sees Ramesh's shift as incomplete.
    const calc = computeDay(await ownerData(store), (await ownerData(store)).days[D]);
    expect(calc.sheets.find((s) => s.machine.id === 'm1')!.complete).toBe(false);
  });

  it('an untouched placeholder shift is skipped when carrying readings forward', async () => {
    // Owner opened the day (blank "Morning"), nobody worked; previous day's closing must still carry.
    const data = await ownerData(store);
    const blankDay = createDay(data, D);
    await store.apply({ days: [blankDay as any] });
    const later = await ownerData(store);
    expect(getShifts(createDay(later, D1).sheets.m1)[0].readings['m1-n1'].opening).toBe('1100.000');
    // And a staff member starting on D claims that blank slot with the right openings.
    const r = await petrolSave(store, S, { date: D, machineId: 'm1', shift: { id: 'new' } }, NOW);
    const d = (await store.day(D)) as any;
    expect(d.sheets.m1.shifts).toHaveLength(1);
    expect(r.shiftId).toBe(d.sheets.m1.shifts[0].id);
    expect(d.sheets.m1.shifts[0].readings['m1-n1'].opening).toBe('1100.000');
  });
});
