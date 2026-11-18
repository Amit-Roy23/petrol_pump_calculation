import { checkPassword, issueToken, verifyToken } from './auth';
import { missingEnv } from './env';
import { bearer, queryParam, readJson, send, type Req, type Res } from './http';
import type { Store } from './store';
import { parsePatch } from './validate';
import { mergeStaffShifts } from './staffwork';

export async function health(_req: Req, res: Res) {
  const missing = missingEnv();
  send(res, 200, { ok: true, app: 'fuel-ledger', configured: missing.length === 0, missing });
}

export async function login(req: Req, res: Res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const missing = missingEnv();
  if (missing.length) return send(res, 503, { error: `Server not configured: set ${missing.join(', ')}`, missing });
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: 'Invalid JSON' });
  }
  const password = (body as { password?: unknown })?.password;
  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return send(res, 401, { error: 'Wrong password' });
  }
  send(res, 200, issueToken());
}

export function dataHandler(getStore: () => Store) {
  return async function data(req: Req, res: Res) {
    const missing = missingEnv();
    if (missing.length) return send(res, 503, { error: `Server not configured: set ${missing.join(', ')}`, missing });
    if (!verifyToken(bearer(req))) return send(res, 401, { error: 'Login required' });

    try {
      const store = getStore();
      if (req.method === 'GET') {
        const since = Number(queryParam(req, 'rev'));
        if (Number.isFinite(since) && since > 0) {
          const rev = await store.rev();
          if (rev === since) return send(res, 200, { unchanged: true, rev });
        }
        return send(res, 200, await store.snapshot());
      }
      if (req.method === 'PUT' || req.method === 'POST') {
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          return send(res, 400, { error: 'Invalid JSON' });
        }
        const { patch, error } = parsePatch(body);
        if (!patch) return send(res, 400, { error });
        // Never lose a shift a staff member saved from their phone after this copy was loaded.
        let merged = false;
        if (patch.days?.length) {
          const now = new Date();
          const stored = await Promise.all(patch.days.map((d) => store.day(String(d.date))));
          patch.days.forEach((d, i) => {
            if (mergeStaffShifts(d, stored[i], now)) merged = true;
          });
        }
        const rev = await store.apply(patch);
        return send(res, 200, merged ? { ok: true, rev, merged: true } : { ok: true, rev });
      }
      return send(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      console.error('[fuel-ledger] data error', err);
      return send(res, 500, { error: 'Database error – check MONGODB_URI and Atlas network access' });
    }
  };
}
