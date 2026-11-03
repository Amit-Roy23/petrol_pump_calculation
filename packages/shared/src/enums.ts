export enum Role {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  ATTENDANT = 'ATTENDANT',
}

export enum RoundingMode {
  TRUNCATE = 'TRUNCATE',
  ROUND_HALF_UP = 'ROUND_HALF_UP',
}

export enum Currency {
  INR = 'INR',
}

export enum ProductUnit {
  L = 'L',
}

export enum SheetStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  LOCKED = 'LOCKED',
}

export enum Shift {
  DAY = 'DAY',
  NIGHT = 'NIGHT',
  MORNING = 'MORNING',
  EVENING = 'EVENING',
}

export enum PaymentMode {
  CASH = 'CASH',
  ONLINE = 'ONLINE', // P.T.M / Paytm / UPI
  CARD = 'CARD',
  CREDIT = 'CREDIT', // Due / বাকি
}

export enum CreditLedgerType {
  SALE = 'SALE',
  RECEIPT = 'RECEIPT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum DayClosingStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  SUBMIT = 'SUBMIT',
  APPROVE = 'APPROVE',
  REOPEN = 'REOPEN',
  LOCK = 'LOCK',
  UNLOCK = 'UNLOCK',
  DELETE = 'DELETE',
}

export const DENOMINATION_VALUES = [
  2000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 'coins'
] as const;

export type DenominationNote = typeof DENOMINATION_VALUES[number];

