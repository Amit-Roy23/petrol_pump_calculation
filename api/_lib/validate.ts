import type { Json, Patch } from './store';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

/** Light structural checks – enough to keep junk out of the database. */
export function parsePatch(body: unknown): { patch?: Patch; error?: string } {
  if (!isObj(body)) return { error: 'Body must be a JSON object' };
  const patch: Patch = {};
  if (body.settings !== undefined) {
    if (!isObj(body.settings) || !Array.isArray(body.settings.products) || !Array.isArray(body.settings.machines)) return { error: 'Invalid settings' };
    patch.settings = body.settings;
  }
  for (const key of ['customers', 'receipts'] as const) {
    if (body[key] !== undefined) {
      const arr = body[key];
      if (!Array.isArray(arr) || !arr.every((x) => isObj(x) && typeof x.id === 'string')) return { error: `Invalid ${key}` };
      patch[key] = arr as Json[];
    }
  }
  if (body.days !== undefined) {
    const arr = body.days;
    if (!Array.isArray(arr) || !arr.every((d) => isObj(d) && typeof d.date === 'string' && DATE.test(d.date) && isObj(d.sheets))) return { error: 'Invalid days' };
    patch.days = arr as Json[];
  }
  if (body.deleteDays !== undefined) {
    const arr = body.deleteDays;
    if (!Array.isArray(arr) || !arr.every((d) => typeof d === 'string' && DATE.test(d))) return { error: 'Invalid deleteDays' };
    patch.deleteDays = arr as string[];
  }
  return { patch };
}
