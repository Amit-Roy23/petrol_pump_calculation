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

export interface TokenPayload {
  exp: number;
  /** Absent on owner tokens issued before roles existed. */
  role?: 'owner' | 'staff';
  /** Staff id (staff tokens only). */
  sid?: string;
  /** Start of the staff PIN hash – changing the PIN signs the staff member out. */
  ph?: string;
}

function issue(payload: TokenPayload): { token: string; expiresAt: number } {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${body}.${sign(body)}`, expiresAt: payload.exp };
}

const expiry = (now: number) => now + TOKEN_DAYS * 24 * 60 * 60 * 1000;

/** Owner token: full access to the ledger. */
export function issueToken(now = Date.now()): { token: string; expiresAt: number } {
  return issue({ exp: expiry(now), role: 'owner' });
}

/** Staff token: attendance (punch in/out) only. */
export function issueStaffToken(staffId: string, pinHash: string, now = Date.now()): { token: string; expiresAt: number } {
  return issue({ exp: expiry(now), role: 'staff', sid: staffId, ph: pinHash.slice(0, 12) });
}

/** Checks the signature and expiry; returns the payload or null. */
export function readToken(token: string | undefined, now = Date.now()): TokenPayload | null {
  if (!token || !appPassword()) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenPayload;
    return typeof p.exp === 'number' && p.exp > now ? p : null;
  } catch {
    return null;
  }
}

/** Owner access only – staff tokens are rejected. */
export function verifyToken(token: string | undefined, now = Date.now()): boolean {
  const p = readToken(token, now);
  return !!p && p.role !== 'staff';
}

/** Same scheme the web app uses when the owner sets a PIN. */
export function hashPin(staffId: string, pin: string): string {
  return createHash('sha256').update(`fuel-ledger:${staffId}:${pin}`).digest('hex');
}
