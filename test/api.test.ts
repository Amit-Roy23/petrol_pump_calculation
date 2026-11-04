import { describe, it, expect, beforeEach } from 'vitest';
import { Readable } from 'stream';
import { dataHandler, health, login } from '../api/_lib/handlers';
import { memoryStore, type Store } from '../api/_lib/store';
import { issueToken, verifyToken } from '../api/_lib/auth';

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
