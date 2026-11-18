import { describe, it, expect, beforeEach } from 'vitest';
import { Readable } from 'stream';
import { dataHandler, health, login } from '../api/_lib/handlers';
import { memoryStore, type Store } from '../api/_lib/store';
import { issueToken, verifyToken } from '../api/_lib/auth';
import { explainMetaError, whatsappHandler } from '../api/_lib/whatsapp';

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

describe('whatsapp automatic sending', () => {
  const body = { to: '919876543210', lang: 'en', params: { customer: 'Ghosh\nTransport', station: 'Demo Fuel', balance: '11,451.00', upi: '', contact: '98300 12345' } };
  let calls: { url: string; init: any }[];
  const fakeFetch = (reply: { status: number; json: unknown }) =>
    (async (url: string, init: any) => {
      calls.push({ url, init });
      return { ok: reply.status < 300, status: reply.status, json: async () => reply.json } as Response;
    }) as unknown as typeof fetch;

  beforeEach(() => {
    calls = [];
    process.env.MONGODB_URI = 'mongodb://example/fuel';
    process.env.APP_PASSWORD = 'secret-pass';
    process.env.WHATSAPP_TOKEN = 'EAAG-test';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    delete process.env.WHATSAPP_TEMPLATE;
  });

  it('health says whether automatic sending is set up (without secrets)', async () => {
    const r = await call(health);
    expect(r.body.whatsapp).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain('EAAG');
    delete process.env.WHATSAPP_TOKEN;
    expect((await call(health)).body.whatsapp).toBe(false);
  });

  it('sends the approved template with 5 cleaned variables', async () => {
    const h = whatsappHandler(fakeFetch({ status: 200, json: { messages: [{ id: 'wamid.1' }] } }));
    const { token } = issueToken();
    const r = await call(h, { method: 'POST', token, body });
    expect(r.body).toEqual({ ok: true, id: 'wamid.1' });
    expect(calls[0].url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    expect(calls[0].init.headers.Authorization).toBe('Bearer EAAG-test');
    const sent = JSON.parse(calls[0].init.body);
    expect(sent.template.name).toBe('due_reminder');
    expect(sent.template.language.code).toBe('en');
    expect(sent.template.components[0].parameters.map((p: any) => p.text)).toEqual(['Ghosh Transport', 'Demo Fuel', '11,451.00', '-', '98300 12345']);
  });

  it('needs login, a valid number, and the keys', async () => {
    const h = whatsappHandler(fakeFetch({ status: 200, json: {} }));
    expect((await call(h, { method: 'POST', body })).status).toBe(401);
    const { token } = issueToken();
    expect((await call(h, { method: 'POST', token, body: { ...body, to: '12ab' } })).status).toBe(400);
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    expect((await call(h, { method: 'POST', token, body })).status).toBe(501);
    expect(calls).toHaveLength(0);
  });

  it('explains Meta errors in plain words', async () => {
    const h = whatsappHandler(fakeFetch({ status: 400, json: { error: { code: 132001, message: 'Template name does not exist' } } }));
    const { token } = issueToken();
    const r = await call(h, { method: 'POST', token, body });
    expect(r.status).toBe(502);
    expect(r.body.error).toContain('template');
    expect(explainMetaError({ code: 190 })).toContain('WHATSAPP_TOKEN');
  });
});
