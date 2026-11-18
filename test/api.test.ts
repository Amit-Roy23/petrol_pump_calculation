import { describe, it, expect, beforeEach } from 'vitest';
import { Readable } from 'stream';
import { dataHandler, health, login } from '../api/_lib/handlers';
import { memoryStore, type Store } from '../api/_lib/store';
import { hashPin, issueToken, verifyToken } from '../api/_lib/auth';
import { attendanceHandler, distanceM } from '../api/_lib/attendance';

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

const day = (date: string) => ({ date, rates: { petrol: 10045 }, sheets: { m1: { machineId: 'm1' } }, closing: {}, locked: false });
const settings = { stationName: 'Test', products: [], machines: [] };

describe('api', () => {
  let store: Store;
  let data: ReturnType<typeof dataHandler>;

  beforeEach(() => {
    process.env.MONGODB_URI = 'mongodb://example/fuel';
    process.env.APP_PASSWORD = 'secret-pass';
    delete process.env.AUTH_SECRET;
    store = memoryStore();
    data = dataHandler(() => store);
  });

  it('health reports missing configuration', async () => {
    delete process.env.APP_PASSWORD;
    const r = await call(health);
    expect(r.body).toMatchObject({ ok: true, configured: false, missing: ['APP_PASSWORD'] });
  });

  it('login checks the password and issues a usable token', async () => {
    expect((await call(login, { method: 'POST', body: { password: 'nope' } })).status).toBe(401);
    const ok = await call(login, { method: 'POST', body: { password: 'secret-pass' } });
    expect(ok.status).toBe(200);
    expect(verifyToken(ok.body.token)).toBe(true);
  });

  it('rejects data access without a valid token', async () => {
    expect((await call(data)).status).toBe(401);
    expect((await call(data, { token: 'abc.def' })).status).toBe(401);
    const expired = issueToken(Date.now() - 31 * 864e5).token;
    expect((await call(data, { token: expired })).status).toBe(401);
  });

  it('tokens stop working when the password changes', async () => {
    const { token } = issueToken();
    process.env.APP_PASSWORD = 'changed';
    expect((await call(data, { token })).status).toBe(401);
  });

  it('stores patches and returns a snapshot with revisions', async () => {
    const { token } = issueToken();
    const empty = await call(data, { token });
    expect(empty.body).toMatchObject({ rev: 0, settings: null, days: {} });

    const put = await call(data, {
      method: 'PUT',
      token,
      body: { settings, customers: [{ id: 'c1', name: 'A' }], days: [day('2026-06-19'), day('2026-06-20')] },
    });
    expect(put.body).toEqual({ ok: true, rev: 1 });

    await call(data, { method: 'PUT', token, body: { deleteDays: ['2026-06-20'], receipts: [{ id: 'r1', amountPaise: 100 }] } });
    const snap = await call(data, { token });
    expect(snap.body.rev).toBe(2);
    expect(Object.keys(snap.body.days)).toEqual(['2026-06-19']);
    expect(snap.body.customers).toHaveLength(1);
    expect(snap.body.receipts).toHaveLength(1);
    expect(snap.body.settings.stationName).toBe('Test');

    expect((await call(data, { token, url: '/api/data?rev=2' })).body).toEqual({ unchanged: true, rev: 2 });
    expect((await call(data, { token, url: '/api/data?rev=1' })).body.rev).toBe(2);
  });

  it('stores LPG days separately from petrol days', async () => {
    const { token } = issueToken();
    await call(data, { method: 'PUT', token, body: { lpgDays: [{ date: '2026-11-10', refills: {} }], days: [day('2026-11-10')] } });
    let snap = await call(data, { token });
    expect(Object.keys(snap.body.lpgDays)).toEqual(['2026-11-10']);
    expect(Object.keys(snap.body.days)).toEqual(['2026-11-10']);
    await call(data, { method: 'PUT', token, body: { deleteLpgDays: ['2026-11-10'] } });
    snap = await call(data, { token });
    expect(snap.body.lpgDays).toEqual({});
    expect(Object.keys(snap.body.days)).toEqual(['2026-11-10']);
    expect((await call(data, { method: 'PUT', token, body: { lpgDays: [{ date: 'bad' }] } })).status).toBe(400);
  });

    it('stores wine shop days separately', async () => {
    const { token } = issueToken();
    await call(data, { method: 'PUT', token, body: { wineDays: [{ date: '2026-11-18', rows: {} }] } });
    let snap = await call(data, { token });
    expect(Object.keys(snap.body.wineDays)).toEqual(['2026-11-18']);
    expect(snap.body.lpgDays).toEqual({});
    await call(data, { method: 'PUT', token, body: { deleteWineDays: ['2026-11-18'] } });
    snap = await call(data, { token });
    expect(snap.body.wineDays).toEqual({});
    expect((await call(data, { method: 'PUT', token, body: { wineDays: [{ date: 'x' }] } })).status).toBe(400);
  });

    it('validates the patch shape', async () => {
    const { token } = issueToken();
    const bad = [{ days: [{ date: '19/06/2026', sheets: {} }] }, { settings: { products: 'x' } }, { customers: [{ name: 'no id' }] }, { deleteDays: ['x'] }, []];
    for (const body of bad) expect((await call(data, { method: 'PUT', token, body })).status).toBe(400);
  });

  it('refuses to run without configuration', async () => {
    delete process.env.MONGODB_URI;
    expect((await call(data, { token: 'x' })).status).toBe(503);
    expect((await call(login, { method: 'POST', body: { password: 'secret-pass' } })).status).toBe(503);
  });
});

describe('staff attendance', () => {
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(400);
  let store: Store;
  let clock: Date;
  let att: ReturnType<typeof attendanceHandler>;

  beforeEach(async () => {
    process.env.MONGODB_URI = 'mongodb://example/fuel';
    process.env.APP_PASSWORD = 'secret-pass';
    store = memoryStore();
    clock = new Date('2026-11-20T03:30:00.000Z'); // 09:00 IST
    att = attendanceHandler(() => store, () => clock);
    await store.apply({
      settings: {
        stationName: 'Demo',
        products: [],
        machines: [],
        attendance: { lat: 22.5726, lng: 88.3639, radiusM: 200 },
        staff: [
          { id: 'st1', name: 'Ramesh', phone: '98765 43210', active: true, pinHash: hashPin('st1', '1234') },
          { id: 'st2', name: 'Old Staff', phone: '9000000000', active: false, pinHash: hashPin('st2', '1111') },
          { id: 'st3', name: 'No PIN', phone: '9111111111', active: true },
        ],
      },
    });
  });

  const staffLogin = async (phone = '+91 98765 43210', pin = '1234') => call(att, { method: 'POST', url: '/api/attendance?action=staff-login', body: { phone, pin } });
  const punch = (token: string, type: 'in' | 'out', extra: Record<string, unknown> = {}) =>
    call(att, { method: 'POST', url: '/api/attendance?action=punch', token, body: { type, photo, lat: 22.5728, lng: 88.364, accuracy: 12, clientAt: 'x', ...extra } });

  it('staff log in with mobile + PIN; wrong PIN, inactive or no-PIN staff are refused', async () => {
    const ok = await staffLogin();
    expect(ok.status).toBe(200);
    expect(ok.body.staff).toEqual({ id: 'st1', name: 'Ramesh' });
    expect((await staffLogin('9876543210', '0000')).status).toBe(401);
    expect((await staffLogin('9000000000', '1111')).status).toBe(401);
    expect((await staffLogin('9111111111', '1234')).status).toBe(401);
  });

  it('a staff token cannot read or change the ledger', async () => {
    const { token } = (await staffLogin()).body;
    expect((await call(dataHandler(() => store), { token })).status).toBe(401);
    expect((await call(att, { url: '/api/attendance?action=list', token })).status).toBe(403);
  });

  it('punch in → punch out with server time, distance and photo', async () => {
    const { token } = (await staffLogin()).body;
    const a = await punch(token, 'in');
    expect(a.status).toBe(200);
    expect(a.body.punch.at).toBe('2026-11-20T03:30:00.000Z');
    expect(a.body.punch.inside).toBe(true);
    expect(a.body.punch.distanceM).toBeLessThan(50);
    expect((await punch(token, 'in')).status).toBe(409); // already in
    clock = new Date('2026-11-20T12:00:00.000Z');
    const b = await punch(token, 'out', { lat: 22.6, lng: 88.4 });
    expect(b.status).toBe(200);
    expect(b.body.punch.inside).toBe(false);
    expect((await punch(token, 'out')).status).toBe(409); // must punch in first
    const st = await call(att, { url: '/api/attendance?action=status', token });
    expect(st.body.last.type).toBe('out');
    expect(st.body.recent).toHaveLength(2);
    // Owner sees both, can open the photo and delete
    const owner = issueToken().token;
    const list = await call(att, { url: '/api/attendance?action=list&from=2026-11-20T00:00:00.000Z&to=2026-11-21T00:00:00.000Z', token: owner });
    expect(list.body.punches.map((p: any) => p.type)).toEqual(['out', 'in']);
    expect(JSON.stringify(list.body)).not.toContain('base64');
    const ph = await call(att, { url: `/api/attendance?action=photo&id=${list.body.punches[1].photoId}`, token: owner });
    expect(ph.body.data).toBe(photo);
    expect((await call(att, { method: 'POST', url: `/api/attendance?action=delete&id=${list.body.punches[0].id}`, token: owner })).status).toBe(200);
  });

  it('a forgotten punch-out does not block the next day', async () => {
    const { token } = (await staffLogin()).body;
    await punch(token, 'in');
    clock = new Date('2026-11-21T03:30:00.000Z'); // next morning, 24 h later
    expect((await punch(token, 'in')).status).toBe(200);
  });

  it('needs a real photo and location', async () => {
    const { token } = (await staffLogin()).body;
    expect((await punch(token, 'in', { photo: 'data:image/png;base64,AAAA' })).status).toBe(400);
    expect((await punch(token, 'in', { lat: 0, lng: 0 })).status).toBe(400);
    expect((await punch(token, 'in', { lat: undefined })).status).toBe(400);
  });

  it('changing the PIN signs the staff member out', async () => {
    const { token } = (await staffLogin()).body;
    const s = (await store.settings()) as any;
    s.staff[0].pinHash = hashPin('st1', '9999');
    await store.apply({ settings: s });
    expect((await call(att, { url: '/api/attendance?action=status', token })).status).toBe(401);
  });

  it('measures distance correctly', () => {
    expect(distanceM({ lat: 22.5726, lng: 88.3639 }, { lat: 22.5726, lng: 88.3739 })).toBeGreaterThan(1000);
    expect(distanceM({ lat: 22.5726, lng: 88.3639 }, { lat: 22.5726, lng: 88.3639 })).toBe(0);
  });
});
