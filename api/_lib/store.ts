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
}

export interface Patch {
  settings?: Json;
  customers?: Json[];
  receipts?: Json[];
  days?: Json[];
  deleteDays?: string[];
  lpgDays?: Json[];
  deleteLpgDays?: string[];
}

export interface Store {
  rev(): Promise<number>;
  snapshot(): Promise<Snapshot>;
  apply(patch: Patch): Promise<number>;
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
      const get = (id: string) => kv.find((x) => x._id === id)?.value;
      const out: Snapshot = {
        rev: (get('meta') as { rev?: number } | undefined)?.rev ?? 0,
        settings: (get('settings') as Json) ?? null,
        customers: (get('customers') as Json[]) ?? [],
        receipts: (get('receipts') as Json[]) ?? [],
        days: {},
        lpgDays: {},
      };
      for (const day of days) out.days[day._id] = day.value;
      for (const day of lpgDays) out.lpgDays[day._id] = day.value;
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
      await Promise.all(ops);
      const meta = await kv.findOneAndUpdate(
        { _id: 'meta' },
        { $inc: { 'value.rev': 1 }, $set: { updatedAt: now } },
        { upsert: true, returnDocument: 'after' }
      );
      return (meta?.value as { rev?: number } | undefined)?.rev ?? 1;
    },
  };
}

/* ---------------- In-memory implementation (tests / local) ---------------- */

export function memoryStore(): Store {
  const s: Snapshot = { rev: 0, settings: null, customers: [], receipts: [], days: {}, lpgDays: {} };
  return {
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
      return ++s.rev;
    },
  };
}
