import type { RoundingMode } from '@petrolpump/shared';

export type Lang = 'en' | 'bn';
export type ThemePref = 'system' | 'light' | 'dark';
export type FuelTone = 'petrol' | 'diesel' | 'premium' | 'cng';

export interface Product {
  id: string;
  name: string;
  nameBn: string;
  tone: FuelTone;
  /** Default selling rate in paise, copied into each new day. */
  ratePaise: number;
}

export interface NozzleConfig {
  id: string;
  label: string;
  productId: string;
  /** Totaliser reading used as the opening reading the very first time. */
  initialReading: string;
}

export interface Machine {
  id: string;
  name: string;
  attendant: string;
  active: boolean;
  nozzles: NozzleConfig[];
}

export interface Settings {
  stationName: string;
  products: Product[];
  machines: Machine[];
  roundingMode: RoundingMode;
  /** Short/excess within this many paise counts as OK. */
  tolerancePaise: number;
  language: Lang;
  theme: ThemePref;
}

export interface NozzleReading {
  opening: string;
  closing: string;
  testing: string;
}

export interface Entry {
  id: string;
  amountPaise: number;
  note?: string;
  /** Only for due (credit) entries. */
  customerId?: string;
}

export interface MachineSheet {
  machineId: string;
  attendant: string;
  readings: Record<string, NozzleReading>;
  cashPaise: number;
  online: Entry[];
  card: Entry[];
  dues: Entry[];
  remark: string;
}

export interface LineItem {
  id: string;
  label: string;
  amountPaise: number;
}

export interface DayClosing {
  /** note value (as string, e.g. "500") -> count. "coins" holds rupees. */
  denominations: Record<string, number>;
  otherCash: LineItem[];
  expenses: LineItem[];
}

export interface DayRecord {
  date: string; // YYYY-MM-DD
  rates: Record<string, number>; // productId -> paise
  sheets: Record<string, MachineSheet>;
  closing: DayClosing;
  locked: boolean;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  openingDuePaise: number;
}

export interface DueReceipt {
  id: string;
  customerId: string;
  date: string;
  amountPaise: number;
  mode: 'cash' | 'online';
  note: string;
}

export interface AppData {
  version: 1;
  settings: Settings;
  days: Record<string, DayRecord>;
  customers: Customer[];
  receipts: DueReceipt[];
}
