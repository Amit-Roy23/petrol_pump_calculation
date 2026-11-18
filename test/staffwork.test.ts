import { describe, it, expect, beforeEach } from 'vitest';
import { Readable } from 'stream';
import { dataHandler } from '../api/_lib/handlers';
import { memoryStore, type Store } from '../api/_lib/store';
import { hashPin, issueToken } from '../api/_lib/auth';
import { attendanceHandler } from '../api/_lib/attendance';
import { dateAllowed, mergeStaffShifts } from '../api/_lib/staffwork';

type Result = { status: number; body: any };

function call(handler: (req: any, res: any) => Promise<unknown>, opts: { method?: string; url?: string; body?: unknown; token?: string } = {}): Promise<Result> {
  const req: any = Readable.from(opts.body !== undefined ? [Buffer.from(JSON.stringify(opts.body))] : []);
  req.method = opts.method ?? 'GET';
  req.url = opts.url ?? '/';
  req.headers = opts.token ? { authorization: `Bearer ${opts.token}` } : {};
  return new Promise((resolve) => {
    const res: any = {
      statusCode: 200,
      setHeader() {},
      end(s: string) {
        resolve({ status: this.statusCode, body: JSON.parse(s) });
      },
    };
    handler(req, res);
  });
}

const NOW = new Date('2026-06-20T08:00:00Z');
const TODAY = '2026-06-20';
const nozzles = [
  { id: 'm1-n1', label: 'N1', productId: 'petrol', initialReading: '1000.000' },
  { id: 'm1-n2', label: 'N2', productId: 'diesel', initialReading: '500.000' },
];
const settings = {
  stationName: 'Test',
  products: [
    { id: 'petrol', name: 'Petrol', ratePaise: 10000 },
    { id: 'diesel', name: 'Diesel', ratePaise: 9000 },
  ],
  machines: [
    { id: 'm1', name: '219', active: true, attendant: '', nozzles },
    { id: 'm2', name: '285', active: false, attendant: '', nozzles: [] },
  ],
  staff: [
    { id: 'st-a', name: 'Ramesh', phone: '9000000001', active: true, pinHash: hashPin('st-a', '1111') },
    { id: 'st-b', name: 'Suresh', phone: '9000000002', active: true, pinHash: hashPin('st-b', '2222') },
    { id: 'st-w', name: 'Priya', phone: '9000000003', active: true, pinHash: hashPin('st-w', '3333'), businesses: ['wine'] },
  ],
};

describe('staff petrol work', () => {
  let store: Store;
  let att: ReturnType<typeof attendanceHandler>;
  let data: ReturnType<typeof dataHandler>;
  const owner = () => issueToken().token;

  const loginAs = async (phone: string, pin: string) => (await call(att, { method: 'POST', url: '/?action=staff-login', body: { phone, pin } })).body.token as string;
  const view = (token: string, date = TODAY) => call(att, { url: `/?action=petrol&date=${date}`, token });
  const save = (token: string, body: unknown) => call(att, { method: 'POST', url: '/?action=petrol-save', token, body });

  beforeEach(async () => {
    process.env.MONGODB_URI = 'mongodb://example/fuel';
    process.env.APP_PASSWORD = 'secret-pass';
    delete process.env.AUTH_SECRET;
    store = memoryStore();
    att = attendanceHandler(() => store, () => NOW);
    data = dataHandler(() => store);
    await store.apply({
      settings,
      customers: [{ id: 'c1', name: 'Ghosh Transport', phone: '98', openingDuePaise: 500000 }],
      days: [
        {
          date: '2026-06-19',
          rates: { petrol: 10000, diesel: 9000 },
          sheets: { m1: { machineId: 'm1', attendant: 'Old', readings: { 'm1-n1': { opening: '1000.000', closing: '1100.000', testing: '' }, 'm1-n2': { opening: '500.000', closing: '550.000', testing: '' } }, cashPaise: 123400, online: [], card: [], dues: [], remark: 'secret' } },
          closing: { denominations: { '500': 10 }, otherCash: [], expenses: [] },
          locked: true,
          updatedAt: '',
        },
      ],
    });
  });

  it('a staff token can never read or write the owner ledger', async () => {
    const t = await loginAs('9000000001', '1111');
    expect((await call(data, { token: t })).status).toBe(401);
    expect((await call(data, { method: 'PUT', token: t, body: { days: [] } })).status).toBe(401);
  });

  it('only today / yesterday are open to staff', async () => {
    expect(dateAllowed('2026-06-19', NOW)).toBe(true);
    expect(dateAllowed('2026-06-21', NOW)).toBe(true); // ahead-of-UTC time zones
    expect(dateAllowed('2026-06-18', NOW)).toBe(false);
    const t = await loginAs('9000000001', '1111');
    expect((await view(t, '2026-06-10')).status).toBe(403);
    expect((await save(t, { date: '2026-06-10', machineId: 'm1', shift: {} })).status).toBe(403);
  });

  it('wine-only staff cannot open the petrol sheet', async () => {
    const t = await loginAs('9000000003', '3333');
    expect((await view(t)).status).toBe(403);
  });

  it('view hides money: customers by name only, earlier days readings only', async () => {
    const t = await loginAs('9000000001', '1111');
    const r = await view(t);
    expect(r.status).toBe(200);
    expect(r.body.me).toEqual({ id: 'st-a', name: 'Ramesh' });
    expect(r.body.day).toBeNull();
    expect(r.body.customers).toEqual([{ id: 'c1', name: 'Ghosh Transport' }]);
    expect(r.body.settings.machines.map((m: any) => m.id)).toEqual(['m1']);
    expect(r.body.settings.staff.every((s: any) => !s.pinHash && !s.phone)).toBe(true);
    const prev = r.body.previousDays[0];
    expect(prev.sheets.m1.shifts[0].readings['m1-n1'].closing).toBe('1100.000');
    expect(prev.sheets.m1.shifts[0].cashPaise).toBe(0);
    expect(prev.sheets.m1.shifts[0].remark).toBe('');
    expect(prev.closing.denominations).toEqual({});
    expect(JSON.stringify(r.body)).not.toContain('123400');
    expect(JSON.stringify(r.body)).not.toContain('500000');
  });

  it('starts a shift with openings carried forward and saves money + dues', async () => {
    const t = await loginAs('9000000001', '1111');
    const r = await save(t, {
      date: TODAY,
      machineId: 'm1',
      shift: {
        id: 'sh1',
        templateId: 'morning',
        readings: { 'm1-n1': { opening: '1.000', closing: '1150.500', testing: '5' }, 'm1-n2': { closing: '' } },
        cashPaise: 250000,
        online: [{ id: 'o1', amountPaise: 11000 }, { id: 'o0', amountPaise: 0 }],
        dues: [{ id: 'd1', amountPaise: 50000, customerId: 'c1' }, { id: 'd2', amountPaise: 20000, customerId: 'new-1' }],
        extra: { ppm: [{ id: 'p1', amountPaise: 3000 }], hack: [{ id: 'x', amountPaise: 1 }] },
        expenses: [{ id: 'e1', label: 'Tea', amountPaise: 4000 }],
        remark: 'ok',
        staffId: 'st-b',
        submittedAt: 'x',
      },
      newCustomers: [{ id: 'new-1', name: 'Das Brothers' }],
    });
    expect(r.status).toBe(200);
    const day = (await store.day(TODAY)) as any;
    const sh = day.sheets.m1.shifts[0];
    expect(sh.id).toBe('sh1');
    expect(sh.staffId).toBe('st-a');
    expect(sh.attendant).toBe('Ramesh');
    expect(sh.label).toBe('Morning');
    expect(sh.readings['m1-n1']).toEqual({ opening: '1100.000', closing: '1150.500', testing: '5' }); // opening can't be changed
    expect(sh.readings['m1-n2'].opening).toBe('550.000');
    expect(sh.online).toHaveLength(1);
    expect(Object.keys(sh.extra)).toEqual(['ppm']);
    expect(sh.submittedAt).toBeUndefined();
    expect(sh.staffUpdatedAt).toBe(NOW.toISOString());
    expect(day.rates).toEqual({ petrol: 10000, diesel: 9000 });
    const customers = await store.customers();
    expect(customers.map((c: any) => c.name)).toEqual(['Ghosh Transport', 'Das Brothers']);
    expect((customers[0] as any).openingDuePaise).toBe(500000); // untouched
  });

  it('rejects dues for unknown customers and edits to locked days', async () => {
    const t = await loginAs('9000000001', '1111');
    const bad = await save(t, { date: TODAY, machineId: 'm1', shift: { dues: [{ id: 'd', amountPaise: 100, customerId: 'nobody' }] } });
    expect(bad.status).toBe(400);
    const locked = await save(t, { date: '2026-06-19', machineId: 'm1', shift: {} });
    expect(locked.status).toBe(409);
    expect((await save(t, { date: TODAY, machineId: 'm2', shift: {} })).status).toBe(400);
  });

  it("can't touch another worker's shift and sees it without money", async () => {
    const a = await loginAs('9000000001', '1111');
    const b = await loginAs('9000000002', '2222');
    await save(a, { date: TODAY, machineId: 'm1', shift: { id: 'sh1', readings: { 'm1-n1': { closing: '1150.000' }, 'm1-n2': { closing: '560.000' } }, cashPaise: 99900 } });
    expect((await save(b, { date: TODAY, machineId: 'm1', shift: { id: 'sh1', cashPaise: 1 } })).status).toBe(403);

    // Suresh starts the next shift: opens where Ramesh closed.
    const r = await save(b, { date: TODAY, machineId: 'm1', shift: { id: 'sh2', cashPaise: 1000 } });
    expect(r.status).toBe(200);
    const day = (await store.day(TODAY)) as any;
    expect(day.sheets.m1.shifts.map((s: any) => s.staffId)).toEqual(['st-a', 'st-b']);
    expect(day.sheets.m1.shifts[1].readings['m1-n1'].opening).toBe('1150.000');
    expect(day.sheets.m1.shifts[1].label).toBe('Evening');

    const seen = (await view(b)).body.day.sheets.m1.shifts;
    expect(seen[0].readings['m1-n1'].closing).toBe('1150.000');
    expect(seen[0].cashPaise).toBe(0);
    expect(seen[1].cashPaise).toBe(1000);
  });

  it('claims the empty shift the owner app created instead of adding another', async () => {
    await store.apply({ days: [{ date: TODAY, rates: { petrol: 10000 }, sheets: { m1: { machineId: 'm1', shifts: [{ id: 'blank', templateId: 'morning', label: 'Morning', start: '06:00', end: '14:00', staffId: '', attendant: '', readings: { 'm1-n1': { opening: '1100.000', closing: '', testing: '' } }, cashPaise: 0, online: [], card: [], dues: [], remark: '' }] } }, closing: {}, locked: false }] });
    const a = await loginAs('9000000001', '1111');
    const r = await save(a, { date: TODAY, machineId: 'm1', shift: { id: 'mine', cashPaise: 500 } });
    expect(r.body.shiftId).toBe('blank');
    const day = (await store.day(TODAY)) as any;
    expect(day.sheets.m1.shifts).toHaveLength(1);
    expect(day.sheets.m1.shifts[0].staffId).toBe('st-a');
  });

  it('submit needs every closing reading, then locks the shift for staff', async () => {
    const a = await loginAs('9000000001', '1111');
    const half = await save(a, { date: TODAY, machineId: 'm1', submit: true, shift: { id: 'sh1', readings: { 'm1-n1': { closing: '1150' } } } });
    expect(half.status).toBe(400);
    const less = await save(a, { date: TODAY, machineId: 'm1', submit: true, shift: { id: 'sh1', readings: { 'm1-n1': { closing: '1150' }, 'm1-n2': { closing: '400' } } } });
    expect(less.status).toBe(400);
    const ok = await save(a, { date: TODAY, machineId: 'm1', submit: true, shift: { id: 'sh1', readings: { 'm1-n1': { closing: '1150' }, 'm1-n2': { closing: '560' } } } });
    expect(ok.status).toBe(200);
    const sh = ((await store.day(TODAY)) as any).sheets.m1.shifts[0];
    expect(sh.submittedBy).toBe('Ramesh');
    expect((await save(a, { date: TODAY, machineId: 'm1', shift: { id: 'sh1', cashPaise: 5 } })).status).toBe(409);
  });

  it("an owner's stale push keeps the staff member's newer shift", async () => {
    const t = owner();
    const ownerDay = { date: TODAY, rates: { petrol: 10000 }, sheets: { m1: { machineId: 'm1', shifts: [{ id: 'blank', templateId: 'morning', label: 'Morning', start: '', end: '', staffId: '', attendant: '', readings: {}, cashPaise: 0, online: [], card: [], dues: [], remark: '' }] } }, closing: { denominations: {}, otherCash: [], expenses: [] }, locked: false };
    await call(data, { method: 'PUT', token: t, body: { days: [ownerDay] } });
    const a = await loginAs('9000000001', '1111');
    await save(a, { date: TODAY, machineId: 'm1', shift: { id: 'blank', cashPaise: 7700 } });

    // Owner's device still has the old copy and changes the day's closing cash.
    const stale = structuredClone(ownerDay);
    stale.closing.denominations = { '500': 2 } as any;
    const r = await call(data, { method: 'PUT', token: t, body: { days: [stale] } });
    expect(r.body.merged).toBe(true);
    const day = (await store.day(TODAY)) as any;
    expect(day.closing.denominations).toEqual({ '500': 2 });
    expect(day.sheets.m1.shifts[0].cashPaise).toBe(7700);

    // Once the owner has the staff version, the owner's corrections win.
    const fresh = structuredClone(day);
    fresh.sheets.m1.shifts[0].cashPaise = 7000;
    const r2 = await call(data, { method: 'PUT', token: t, body: { days: [fresh] } });
    expect(r2.body.merged).toBeUndefined();
    expect(((await store.day(TODAY)) as any).sheets.m1.shifts[0].cashPaise).toBe(7000);
  });

  it('merge keeps a recent staff shift missing from the owner copy, in its place', () => {
    const sh = (id: string, extra: object = {}) => ({ id, templateId: '', label: '', start: '', end: '', staffId: '', attendant: '', readings: {}, cashPaise: 0, online: [], card: [], dues: [], remark: '', ...extra });
    const stored = { sheets: { m1: { machineId: 'm1', shifts: [sh('a', { staffId: 'x', cashPaise: 5 }), sh('s', { staffId: 'st', staffUpdatedAt: '2026-06-20T07:55:00Z', cashPaise: 9 })] } } };
    const incoming: any = { sheets: { m1: { machineId: 'm1', shifts: [sh('a', { staffId: 'x', cashPaise: 6 })] } } };
    expect(mergeStaffShifts(incoming, stored, NOW)).toBe(true);
    expect(incoming.sheets.m1.shifts.map((s: any) => s.id)).toEqual(['a', 's']);
    expect(incoming.sheets.m1.shifts[0].cashPaise).toBe(6);

    // Deleted by the owner long after the staff save → stays deleted.
    const later = { sheets: { m1: { machineId: 'm1', shifts: [sh('a')] } } } as any;
    expect(mergeStaffShifts(later, stored, new Date('2026-06-20T10:00:00Z'))).toBe(false);
  });
});
