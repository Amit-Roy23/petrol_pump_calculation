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

/** Extra non-cash collection methods the station uses (e.g. PPM, PPS). */
export interface PaymentMethod {
  id: string;
  name: string;
  nameBn: string;
  active: boolean;
}

/** A pump attendant / worker. */
export interface Staff {
  id: string;
  name: string;
  phone: string;
  active: boolean;
}

/** Named shift with usual times, e.g. Morning 06:00–14:00. */
export interface ShiftTemplate {
  id: string;
  name: string;
  nameBn: string;
  start: string; // HH:MM
  end: string; // HH:MM
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
  /** Optional for data saved before this field existed – see paymentMethods(). */
  paymentMethods?: PaymentMethod[];
  /** Optional for older data – see staffList() / shiftTemplates(). */
  staff?: Staff[];
  shiftTemplates?: ShiftTemplate[];
  /** LPG business setup (optional for older data – see lpgSettings()). */
  lpg?: LpgSettings;
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

/**
 * One worker's shift on one machine: its own readings and money.
 * Shift N's closing reading is shift N+1's opening.
 */
export interface ShiftSheet {
  id: string;
  templateId: string;
  /** Display name of the shift, e.g. "Morning". */
  label: string;
  start: string; // HH:MM
  end: string; // HH:MM
  staffId: string;
  /** Worker name as typed (kept even if the staff record changes). */
  attendant: string;
  readings: Record<string, NozzleReading>;
  cashPaise: number;
  online: Entry[];
  card: Entry[];
  dues: Entry[];
  extra?: Record<string, Entry[]>;
  /** Expenses the worker paid out of this shift's cash (tea, repairs …). */
  expenses?: LineItem[];
  remark: string;
}

/**
 * A machine's day. New data lives in `shifts`; the top-level reading/money
 * fields are the pre-shift format and are read as a single shift.
 */
export interface MachineSheet {
  machineId: string;
  shifts?: ShiftSheet[];
  attendant: string;
  readings: Record<string, NozzleReading>;
  cashPaise: number;
  online: Entry[];
  card: Entry[];
  dues: Entry[];
  /** Slips for the extra payment methods, keyed by PaymentMethod.id. */
  extra?: Record<string, Entry[]>;
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

/* ---------------- LPG business ---------------- */

export type Business = 'petrol' | 'lpg';

/** A cylinder size the LPG agency handles, e.g. Domestic 14.2 kg. */
export interface LpgCylinder {
  id: string;
  name: string;
  nameBn: string;
  /** Default refill price in paise, copied into each new day. */
  refillRatePaise: number;
  active: boolean;
  /** Stock on the first day the app is used. */
  openingFull: number;
  openingEmpty: number;
  openingDefective: number;
}

/** Accessory sold at the counter: Oven, Hose, DPR, Others. */
export interface LpgItem {
  id: string;
  name: string;
  nameBn: string;
  ratePaise: number;
  active: boolean;
}

export interface LpgSettings {
  businessName: string;
  cylinders: LpgCylinder[];
  items: LpgItem[];
  /** Usual new-connection charge, pre-filled when adding one. */
  newConnectionRatePaise: number;
}

/**
 * Quantity sold at one rate. Online (PhonePe) and due are entered as money;
 * cash is what's left: qty × rate − online − due.
 */
export interface LpgQtyRow {
  ratePaise: number;
  qty: number;
  onlinePaise: number;
  duePaise: number;
}

export type LpgPayMode = 'cash' | 'online' | 'due';

/** New connection or TV-in (transfer voucher in), one per customer. */
export interface LpgConnection {
  id: string;
  kind: 'new' | 'tvin';
  cylinderId: string;
  amountPaise: number;
  mode: LpgPayMode;
  note: string;
}

/** TV return / termination: deposit refunded to a customer who surrenders a cylinder. */
export interface LpgRefund {
  id: string;
  cylinderId: string;
  amountPaise: number;
  note: string;
}

/** Cylinder movements other than sales, per cylinder type. */
export interface LpgStockMove {
  /** Full cylinders received from the plant (truck in). */
  received: number;
  /** Empty cylinders sent back to the plant. */
  emptySent: number;
  /** Full cylinders found defective (leak etc.). */
  defectiveFound: number;
  /** Defective cylinders returned to the plant. */
  defectiveSent: number;
}

export interface LpgDay {
  date: string;
  refills: Record<string, LpgQtyRow>; // cylinderId → row
  items: Record<string, LpgQtyRow>; // itemId → row
  connections: LpgConnection[];
  refunds: LpgRefund[];
  costs: LineItem[];
  stock: Record<string, LpgStockMove>;
  currentAccountPaise: number;
  edfsAccountPaise: number;
  remark: string;
  locked: boolean;
  updatedAt: string;
}

export interface AppData {
  version: 1;
  settings: Settings;
  days: Record<string, DayRecord>;
  customers: Customer[];
  receipts: DueReceipt[];
  /** LPG business days (optional for data saved before LPG existed). */
  lpgDays?: Record<string, LpgDay>;
}
