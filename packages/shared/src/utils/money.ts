import { Decimal } from 'decimal.js';

/**
 * Converts a rupee amount (number, string, or Decimal) to integer paise.
 * e.g., 100.45 -> 10045
 */
export function toPaise(rupees: number | string | Decimal): number {
  return new Decimal(rupees).times(100).round().toNumber();
}

/**
 * Converts integer paise to a Decimal rupee amount.
 * e.g., 10045 -> Decimal(100.45)
 */
export function paiseToDecimal(paise: number): Decimal {
  return new Decimal(paise).dividedBy(100);
}

/**
 * Converts integer paise to floating number rupees (for display/export only).
 */
export function fromPaise(paise: number): number {
  return paiseToDecimal(paise).toNumber();
}

