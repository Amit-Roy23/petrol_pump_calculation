import { randomUUID } from 'crypto';
import { hashPin, issueStaffToken, readToken, type TokenPayload } from './auth';
import { missingEnv } from './env';
import { bearer, queryParam, readJson, send, type Req, type Res } from './http';
import type { Json, PunchRecord, Store } from './store';

interface StaffRow {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  pinHash?: string;
}
interface Geofence {
  lat: number;
  lng: number;
  radiusM: number;
}

/** A punch-in older than this without a punch-out counts as forgotten. */
export const OPEN_SHIFT_HOURS = 16;
/** ~300 KB of base64 is plenty for a 480 px JPEG selfie. */
const MAX_PHOTO = 400_000;

const last10 = (phone: string) => phone.replace(/\D/g, '').slice(-10);

function staffList(settings: Json | null): StaffRow[] {
  const list = (settings?.staff as StaffRow[] | undefined) ?? [];
  return Array.isArray(list) ? list : [];
}

function geofence(settings: Json | null): Geofence | null {
  const g = (settings?.attendance as { lat?: number; lng?: number; radiusM?: number } | undefined) ?? undefined;
  if (!g || typeof g.lat !== 'number' || typeof g.lng !== 'number' || (!g.lat && !g.lng)) return null;
  return { lat: g.lat, lng: g.lng, radiusM: typeof g.radiusM === 'number' && g.radiusM > 0 ? g.radiusM : 200 };
}

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const fail = (res: Res, status: number, error: string) => send(res, status, { error });

/**
 * /api/attendance?action=…
 *   staff-login (POST, public)  {phone, pin} → staff token
 *   status      (GET, staff)    → staff, last punch, recent punches, pump location
 *   punch       (POST, staff)   {type, photo, lat, lng, accuracy, clientAt}
 *   list        (GET, owner)    ?from&to → punches (no photos)
 *   photo       (GET, owner)    ?id → {data}
 *   delete      (POST, owner)   ?id
 */
export function attendanceHandler(getStore: () => Store, now: () => Date = () => new Date()) {
  return async function attendance(req: Req, res: Res) {
    const missing = missingEnv();
    if (missing.length) return fail(res, 503, `Server not configured: set ${missing.join(', ')}`);
    const action = queryParam(req, 'action') ?? '';
    const store = getStore();

    try {
      /* ---------- staff login (no token yet) ---------- */
      if (action === 'staff-login') {
        if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
        const body = ((await readJson(req)) ?? {}) as { phone?: string; pin?: string };
        const phone = last10(String(body.phone ?? ''));
        const pin = String(body.pin ?? '');
        const staff = staffList(await store.settings()).find((s) => s.active !== false && s.pinHash && last10(s.phone ?? '') === phone && phone.length === 10);
        if (!staff || !/^\d{4,6}$/.test(pin) || hashPin(staff.id, pin) !== staff.pinHash) {
          await new Promise((r) => setTimeout(r, 700)); // slow down guessing
          return fail(res, 401, 'Wrong mobile number or PIN');
        }
        return send(res, 200, { ...issueStaffToken(staff.id, staff.pinHash!), staff: { id: staff.id, name: staff.name } });
      }

      const token = readToken(bearer(req));
      if (!token) return fail(res, 401, 'Login required');

      /* ---------- staff actions ---------- */
      if (action === 'status' || action === 'punch') {
        if (token.role !== 'staff') return fail(res, 403, 'Staff login required');
        const settings = await store.settings();
        const staff = staffList(settings).find((s) => s.id === token.sid);
        // Deactivated or PIN changed → signed out.
        if (!staff || staff.active === false || !staff.pinHash || staff.pinHash.slice(0, 12) !== token.ph) return fail(res, 401, 'Login required');
        const fence = geofence(settings);

        if (action === 'status') {
          const recent = await store.punches({ staffId: staff.id, limit: 20 });
          return send(res, 200, { staff: { id: staff.id, name: staff.name }, stationName: String(settings?.stationName ?? ''), last: recent[0] ?? null, recent, geofence: fence, serverTime: now().toISOString(), openShiftHours: OPEN_SHIFT_HOURS });
        }

        // punch
        if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
        const b = ((await readJson(req)) ?? {}) as Partial<{ type: string; photo: string; lat: number; lng: number; accuracy: number; clientAt: string; device: string }>;
        if (b.type !== 'in' && b.type !== 'out') return fail(res, 400, 'Invalid punch type');
        if (typeof b.photo !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(b.photo) || b.photo.length > MAX_PHOTO) return fail(res, 400, 'A photo is required');
        if (typeof b.lat !== 'number' || typeof b.lng !== 'number' || Math.abs(b.lat) > 90 || Math.abs(b.lng) > 180 || (b.lat === 0 && b.lng === 0)) return fail(res, 400, 'Location is required');

        const at = now();
        const last = (await store.punches({ staffId: staff.id, limit: 1 }))[0];
        const lastIsOpenIn = !!last && last.type === 'in' && at.getTime() - new Date(last.at).getTime() < OPEN_SHIFT_HOURS * 3600_000;
        if (b.type === 'in' && lastIsOpenIn) return send(res, 409, { error: 'Already punched in – punch out first', last });
        if (b.type === 'out' && (!last || last.type !== 'in')) return send(res, 409, { error: 'Punch in first', last: last ?? null });

        const dist = fence ? distanceM(fence, { lat: b.lat, lng: b.lng }) : null;
        const rec: PunchRecord = {
          id: randomUUID(),
          staffId: staff.id,
          staffName: staff.name,
          type: b.type,
          at: at.toISOString(),
          clientAt: typeof b.clientAt === 'string' ? b.clientAt.slice(0, 40) : '',
          lat: Math.round(b.lat * 1e6) / 1e6,
          lng: Math.round(b.lng * 1e6) / 1e6,
          accuracy: typeof b.accuracy === 'number' ? Math.round(b.accuracy) : -1,
          distanceM: dist,
          inside: fence && dist !== null ? dist <= fence.radiusM : null,
          photoId: randomUUID(),
          device: String(b.device ?? req.headers['user-agent'] ?? '').slice(0, 120),
        };
        await store.addPunch(rec, b.photo);
        return send(res, 200, { ok: true, punch: rec });
      }

      /* ---------- owner actions ---------- */
      if (!isOwner(token)) return fail(res, 403, 'Owner login required');
      if (action === 'list') {
        const rows = await store.punches({ from: queryParam(req, 'from') || undefined, to: queryParam(req, 'to') || undefined, staffId: queryParam(req, 'staffId') || undefined });
        return send(res, 200, { punches: rows, openShiftHours: OPEN_SHIFT_HOURS });
      }
      if (action === 'photo') {
        const data = await store.photo(queryParam(req, 'id') ?? '');
        return data ? send(res, 200, { data }) : fail(res, 404, 'Photo not found');
      }
      if (action === 'delete') {
        if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
        const ok = await store.deletePunch(queryParam(req, 'id') ?? '');
        return ok ? send(res, 200, { ok: true }) : fail(res, 404, 'Not found');
      }
      return fail(res, 400, 'Unknown action');
    } catch (e) {
      console.error('[fuel-ledger] attendance error', e);
      return fail(res, 500, 'Database error – try again');
    }
  };
}

const isOwner = (t: TokenPayload) => t.role !== 'staff';
