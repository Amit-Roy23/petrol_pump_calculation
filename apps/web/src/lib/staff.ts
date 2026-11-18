import type { AppData, Business, Staff } from './types';
import { staffList } from './compute';
import type { TKey } from './i18n';

export const BUSINESS_LIST: Business[] = ['petrol', 'lpg', 'wine'];

/** Label key and colour classes for each part of the business. */
export const BUSINESS_META: Record<Business, { key: TKey; chip: string; dot: string }> = {
  petrol: { key: 'bizPetrol', chip: 'bg-brand-soft text-brand', dot: 'bg-brand' },
  lpg: { key: 'bizLpg', chip: 'bg-cng-soft text-cng', dot: 'bg-cng' },
  wine: { key: 'bizWine', chip: 'bg-premium-soft text-premium', dot: 'bg-premium' },
};

/** Parts a staff member works in (older records = petrol only). */
export function staffBusinesses(s: Staff): Business[] {
  const b = (s.businesses ?? []).filter((x) => BUSINESS_LIST.includes(x));
  return b.length ? b : ['petrol'];
}

/** Staff who work in a given part. */
export function staffFor(data: AppData, business: Business, activeOnly = true): Staff[] {
  return staffList(data.settings).filter((s) => (!activeOnly || s.active) && staffBusinesses(s).includes(business));
}

const last10 = (phone: string) => phone.replace(/\D/g, '').slice(-10);

/**
 * Checks a staff record before saving. Returns an i18n key for the problem,
 * or null when it's fine.
 */
export function validateStaff(all: Staff[], s: Staff, newPin: string): TKey | null {
  if (!s.name.trim()) return 'nameRequired';
  if (all.some((x) => x.id !== s.id && x.name.trim().toLowerCase() === s.name.trim().toLowerCase())) return 'alreadyExists';
  if (!staffBusinesses(s).length || !(s.businesses ?? ['petrol']).length) return 'partsRequired';
  if (newPin && !/^\d{4,6}$/.test(newPin)) return 'pinInvalid';
  const p = last10(s.phone);
  if ((newPin || s.pinHash) && p.length !== 10) return 'phoneNeededForPin';
  if (p.length === 10 && all.some((x) => x.id !== s.id && last10(x.phone) === p)) return 'duplicatePhone';
  return null;
}
