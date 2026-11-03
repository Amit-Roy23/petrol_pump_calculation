import { Decimal } from 'decimal.js';

/**
 * Converts a meter reading (number, string, or Decimal with up to 3 decimals)
 * to an integer in thousandths (milli-units).
 * e.g., 2127209.495 -> 2127209495
 */
export function toMilliUnits(reading: number | string | Decimal): number {
  return new Decimal(reading).times(1000).round().toNumber();
}

/**
 * Converts milli-units back to Decimal reading.
 * e.g., 2127209495 -> Decimal(2127209.495)
 */
export function milliUnitsToDecimal(milli: number): Decimal {
  return new Decimal(milli).dividedBy(1000);
}

/**
 * Converts milli-units to a floating number representation for display.
 */
export function fromMilliUnits(milli: number): number {
  return milliUnitsToDecimal(milli).toNumber();
}

/**
 * Converts litres (up to 2 decimals) to integer centi-litres.
 * e.g., 121.77 -> 12177
 */
export function toCentiLitres(litres: number | string | Decimal): number {
  return new Decimal(litres).times(100).round().toNumber();
}

/**
 * Converts centi-litres back to Decimal litres.
 * e.g., 12177 -> Decimal(121.77)
 */
export function centiLitresToDecimal(centi: number): Decimal {
  return new Decimal(centi).dividedBy(100);
}

/**
 * Converts centi-litres to floating number representation for display.
 */
export function fromCentiLitres(centi: number): number {
  return centiLitresToDecimal(centi).toNumber();
}

