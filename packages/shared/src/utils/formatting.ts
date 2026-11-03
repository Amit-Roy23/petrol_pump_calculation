import { Decimal } from 'decimal.js';
import { fromPaise } from './money.js';

/**
 * Formats a number or string into Indian comma notation.
 * e.g. 1234567.89 -> "12,34,567.89"
 * e.g. 28144.3 -> "28,144.30"
 */
export function formatIndianNumber(value: number | string | Decimal, decimals = 2): string {
  const d = new Decimal(value);
  const fixedStr = d.toFixed(decimals);
  const [intPart, decPart] = fixedStr.split('.');

  const isNegative = intPart.startsWith('-');
  const cleanInt = isNegative ? intPart.slice(1) : intPart;

  if (cleanInt.length <= 3) {
    const formatted = (isNegative ? '-' : '') + cleanInt;
    return decimals > 0 && decPart !== undefined ? `${formatted}.${decPart}` : formatted;
  }

  const lastThree = cleanInt.slice(-3);
  const otherNumbers = cleanInt.slice(0, -3);
  const formattedOthers = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const formatted = (isNegative ? '-' : '') + formattedOthers + ',' + lastThree;

  return decimals > 0 && decPart !== undefined ? `${formatted}.${decPart}` : formatted;
}

/**
 * Formats paise to Indian Rupee string.
 * e.g., 2814430 paise -> "28,144.30" (or with ₹ symbol "₹28,144.30")
 */
export function formatPaise(paise: number, includeSymbol = false): string {
  const rupees = fromPaise(paise);
  const formatted = formatIndianNumber(rupees, 2);
  return includeSymbol ? `₹${formatted}` : formatted;
}

/**
 * Formats litres to string with 2 decimals.
 * e.g., 121.77 -> "121.77"
 */
export function formatLitres(litres: number | string | Decimal): string {
  return formatIndianNumber(litres, 2);
}

/**
 * Formats meter reading to 3 decimal places.
 * e.g. 2127209.495 -> "21,27,209.495" or "2127209.495"
 */
export function formatReading(reading: number | string | Decimal, useGrouping = false): string {
  const d = new Decimal(reading);
  if (useGrouping) {
    return formatIndianNumber(d, 3);
  }
  return d.toFixed(3);
}

