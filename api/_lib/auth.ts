import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { appPassword, mongoUri } from './env';

const TOKEN_DAYS = 30;

function secret(): string {
  // Changing APP_PASSWORD (or AUTH_SECRET) signs everyone out.
  return process.env.AUTH_SECRET || createHash('sha256').update(`${appPassword()}|${mongoUri()}|fuel-ledger`).digest('hex');
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function checkPassword(candidate: unknown): boolean {
  const expected = appPassword();
  if (!expected || typeof candidate !== 'string') return false;
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function issueToken(now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = now + TOKEN_DAYS * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt })).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function verifyToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !appPassword()) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp: number };
    return typeof exp === 'number' && exp > now;
  } catch {
    return false;
  }
}
