import { MongoClient, type Db } from 'mongodb';
import { mongoUri } from './env';

export type Json = Record<string, unknown>;

export interface Snapshot {
  rev: number;
  settings: Json | null;
  customers: Json[];
  receipts: Json[];
  days: Record<string, Json>;
  /** LPG business days, keyed by date. */
  lpgDays: Record<string, Json>;
  /** Wine shop days, keyed by date. */
  wineDays: Record<string, Json>;
}

export interface Patch {
  settings?: Json;
  customers?: Json[];
  receipts?: Json[];
  days?: Json[];
  deleteDays?: string[];
  lpgDays?: Json[];
  deleteLpgDays?: string[];
  wineDays?: Json[];
  deleteWineDays?: string[];
}

/** One punch in or out. The photo is stored separately (photoId). */
export interface PunchRecord {
  id: string;
  staffId: string;
  staffName: string;
  type: 'in' | 'out';
  /** Server time (ISO) – staff can't change it. */
  at: string;
  /** Phone's own clock, for reference only. */
  clientAt: string;
  lat: number;
  lng: number;
  /** GPS accuracy in metres. */
  accuracy: number;
  /** Distance from the pump in metres (null if the pump location isn't set). */
  distanceM: number | null;
  inside: boolean | null;
  photoId: string;
  device: string;
  /** Which part of the business: petrol / lpg / wine (absent on early punches = petrol). */
  business?: string;
}

export interface PunchFilter {
  staffId?: string;
  /** ISO time bounds, inclusive from / exclusive to. */
  from?: string;
  to?: string;
  limit?: number;
}

export interface Store {
  rev(): Promise<number>;
  snapshot(): Promise<Snapshot>;
  apply(patch: Patch): Promise<number>;
  /** Shared settings only (cheaper than a full snapshot). */
  settings(): Promise<Json | null>;
  addPunch(rec: PunchRecord, photo: string): Promise<void>;
  /** Newest first. */
  punches(filter: PunchFilter): Promise<PunchRecord[]>;
  photo(id: string): Promise<string | null>;
  deletePunch(id: string): Promise<boolean>;
}

/* ---------------- MongoDB implementation ---------------- */

const g = globalThis as unknown as { __fuelLedgerMongo?: Promise<MongoClient> };

function client(): Promise<MongoClient> {
  const uri = mongoUri();
  if (!uri) throw new Error('MONGODB_URI is not set');
  // Reuse the connection across warm serverless invocations.
  if (!g.__fuelLedgerMongo) {
    g.__fuelLedgerMongo = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 })
      .connect()
      .catch((err) => {
        g.__fuelLedgerMongo = undefined;
        throw err;
      });
  }
  return g.__fuelLedgerMongo;
}

async function db(): Promise<Db> {
  const c = await client();
  if (process.env.MONGODB_DB) return c.db(process.env.MONGODB_DB);
  // Use the database named in the URI path, else a sensible default.
  try {
    const path = new URL(mongoUri()!).pathname.replace(/^\//, '');
    if (path) return c.db();
  } catch {
    /* unparsable – fall through */
  }
  return c.db('fuel_ledger');
}

type KvDoc = { _id: string; value: unknown; updatedAt?: Date };
type DayDoc = { _id: string; value: Json; updatedAt?: Date };

export function mongoStore(): Store {
  return {
    async rev() {
      const d = await db();
      const meta = await d.collection<KvDoc>('kv').findOne({ _id: 'meta' });
      return (meta?.value as { rev?: number } | undefined)?.rev ?? 0;
    },
    async snapshot() {
      const d = await db();
      const [kv, days, lpgDays] = await Promise.all([
        d.collection<KvDoc>('kv').find({}).toArray(),
        d.collection<DayDoc>('days').find({}).toArray(),
        d.collection<DayDoc>('lpg_days').find({}).toArray(),
      ]);
      const wineDays = await d.collection<DayDoc>('wine_days').find({}).toArray();
      const get = (id: string) => kv.find((x) => x._id === id)?.value;
      const out: Snapshot = {
        rev: (get('meta') as { rev?: number } | undefined)?.rev ?? 0,
        settings: (get('settings') as Json) ?? null,
        customers: (get('customers') as Json[]) ?? [],
        receipts: (get('receipts') as Json[]) ?? [],
        days: {},
        lpgDays: {},
        wineDays: {},
      };
      for (const day of days) out.days[day._id] = day.value;
      for (const day of lpgDays) out.lpgDays[day._id] = day.value;
      for (const day of wineDays) out.wineDays[day._id] = day.value;
      return out;
    },
    async apply(patch) {
      const d = await db();
      const now = new Date();
      const kv = d.collection<KvDoc>('kv');
      const ops: Promise<unknown>[] = [];
      for (const key of ['settings', 'customers', 'receipts'] as const) {
        if (patch[key] !== undefined) ops.push(kv.updateOne({ _id: key }, { $set: { value: patch[key], updatedAt: now } }, { upsert: true }));
      }
      const writes = [
        ...(patch.days ?? []).map((day) => ({
          replaceOne: { filter: { _id: String(day.date) }, replacement: { value: day, updatedAt: now }, upsert: true },
        })),
        ...(patch.deleteDays ?? []).map((date) => ({ deleteOne: { filter: { _id: date } } })),
      ];
      if (writes.length) ops.push(d.collection<DayDoc>('days').bulkWrite(writes, { ordered: false }));
      const lpgWrites = [
        ...(patch.lpgDays ?? []).map((day) => ({
          replaceOne: { filter: { _id: String(day.date) }, replacement: { value: day, updatedAt: now }, upsert: true },
        })),
        ...(patch.deleteLpgDays ?? []).map((date) => ({ deleteOne: { filter: { _id: date } } })),
      ];
      if (lpgWrites.length) ops.push(d.collection<DayDoc>('lpg_days').bulkWrite(lpgWrites, { ordered: false }));
      const wineWrites = [
        ...(patch.wineDays ?? []).map((day) => ({
          replaceOne: { filter: { _id: String(day.date) }, replacement: { value: day, updatedAt: now }, upsert: true },
        })),
        ...(patch.deleteWineDays ?? []).map((date) => ({ deleteOne: { filter: { _id: date } } })),
      ];
      if (wineWrites.length) ops.push(d.collection<DayDoc>('wine_days').bulkWrite(wineWrites, { ordered: false }));
      await Promise.all(ops);
      const meta = await kv.findOneAndUpdate(
        { _id: 'meta' },
        { $inc: { 'value.rev': 1 }, $set: { updatedAt: now } },
        { upsert: true, returnDocument: 'after' }
      );
      return (meta?.value as { rev?: number } | undefined)?.rev ?? 1;
    },
    async settings() {
      const d = await db();
      const doc = await d.collection<KvDoc>('kv').findOne({ _id: 'settings' });
      return (doc?.value as Json) ?? null;
    },
    async addPunch(rec, photo) {
      const d = await db();
      await d.collection<{ _id: string; data: string; at: string }>('attendance_photos').insertOne({ _id: rec.photoId, data: photo, at: rec.at });
      await d.collection<PunchRecord & { _id: string }>('attendance').insertOne({ ...rec, _id: rec.id });
    },
    async punches(f) {
      const d = await db();
      const q: Record<string, unknown> = {};
      if (f.staffId) q.staffId = f.staffId;
      if (f.from || f.to) q.at = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lt: f.to } : {}) };
      const rows = await d
        .collection<PunchRecord & { _id: string }>('attendance')
        .find(q)
        .sort({ at: -1 })
        .limit(Math.min(f.limit ?? 2000, 5000))
        .toArray();
      return rows.map(({ _id, ...r }) => ({ ...r, id: _id }));
    },
    async photo(id) {
      const d = await db();
      const doc = await d.collection<{ _id: string; data: string }>('attendance_photos').findOne({ _id: id });
      return doc?.data ?? null;
    },
    async deletePunch(id) {
      const d = await db();
      const rec = await d.collection<PunchRecord & { _id: string }>('attendance').findOneAndDelete({ _id: id });
      if (!rec) return false;
      await d.collection<{ _id: string }>('attendance_photos').deleteOne({ _id: rec.photoId });
      return true;
    },
  };
}

/* ---------------- In-memory implementation (tests / local) ---------------- */

export function memoryStore(): Store {
  const s: Snapshot = { rev: 0, settings: null, customers: [], receipts: [], days: {}, lpgDays: {}, wineDays: {} };
  const punchRows: PunchRecord[] = [];
  const photos = new Map<string, string>();
  return {
    async settings() {
      return s.settings ? structuredClone(s.settings) : null;
    },
    async addPunch(rec, photo) {
      punchRows.push(structuredClone(rec));
      photos.set(rec.photoId, photo);
    },
    async punches(f) {
      return punchRows
        .filter((r) => (!f.staffId || r.staffId === f.staffId) && (!f.from || r.at >= f.from) && (!f.to || r.at < f.to))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, f.limit ?? 2000)
        .map((r) => structuredClone(r));
    },
    async photo(id) {
      return photos.get(id) ?? null;
    },
    async deletePunch(id) {
      const i = punchRows.findIndex((r) => r.id === id);
      if (i < 0) return false;
      photos.delete(punchRows[i].photoId);
      punchRows.splice(i, 1);
      return true;
    },
    async rev() {
      return s.rev;
    },
    async snapshot() {
      return structuredClone(s);
    },
    async apply(p) {
      if (p.settings !== undefined) s.settings = structuredClone(p.settings);
      if (p.customers !== undefined) s.customers = structuredClone(p.customers);
      if (p.receipts !== undefined) s.receipts = structuredClone(p.receipts);
      for (const day of p.days ?? []) s.days[String(day.date)] = structuredClone(day);
      for (const date of p.deleteDays ?? []) delete s.days[date];
      for (const day of p.lpgDays ?? []) s.lpgDays[String(day.date)] = structuredClone(day);
      for (const date of p.deleteLpgDays ?? []) delete s.lpgDays[date];
      for (const day of p.wineDays ?? []) s.wineDays[String(day.date)] = structuredClone(day);
      for (const date of p.deleteWineDays ?? []) delete s.wineDays[date];
      return ++s.rev;
    },
  };
}
