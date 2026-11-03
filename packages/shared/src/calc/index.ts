import { Decimal } from 'decimal.js';
import { RoundingMode, PaymentMode, DenominationNote } from '../enums.js';
import { toPaise } from '../utils/money.js';

export interface NozzleCalcInput {
  nozzleId?: string;
  productId: string;
  openingReading: number | string | Decimal; // decimal reading e.g. 2127209.495
  closingReading: number | string | Decimal; // decimal reading e.g. 2127216.665
  testingLitres?: number | string | Decimal; // default 0
  isMeterReset?: boolean;
  meterMaxReading?: number | string | Decimal; // e.g. 9999999.999
  resetLitres?: number | string | Decimal; // manual override if meter replaced
}

export interface NozzleCalcResult {
  nozzleId?: string;
  productId: string;
  openingReading: string;
  closingReading: string;
  testingLitres: string;
  litres: string; // 2 decimal places e.g. "7.17"
  litresCenti: number; // integer centi-litres e.g. 717
}

export interface ProductRateInput {
  productId: string;
  ratePaise: number; // e.g. 10045 for 100.45
}

export interface ProductTotalResult {
  productId: string;
  litres: string; // sum of nozzle litres e.g. "121.77"
  litresCenti: number;
  ratePaise: number;
  rateRupees: string;
  amountPaise: number; // e.g. 1223179
  amountRupees: string; // e.g. "12231.79"
}

export interface PaymentItemInput {
  mode: PaymentMode;
  amountPaise: number; // integer paise
  reference?: string;
  creditCustomerId?: string;
  time?: string;
  note?: string;
}

export interface PaymentsSummaryResult {
  cashPaise: number;
  onlinePaise: number;
  cardPaise: number;
  creditPaise: number;
  totalCollectedPaise: number;
  cashRupees: string;
  onlineRupees: string;
  cardRupees: string;
  creditRupees: string;
  totalCollectedRupees: string;
}

export interface SheetCalculationResult {
  nozzleResults: NozzleCalcResult[];
  productTotals: ProductTotalResult[];
  totalAmountPaise: number;
  totalAmountRupees: string;
  collections: PaymentsSummaryResult;
  shortExcessPaise: number; // negative = short, positive = excess
  shortExcessRupees: string;
  isShort: boolean;
  isExcess: boolean;
  isBalanced: boolean;
  isWithinTolerance: boolean;
}

/**
 * Calculates litres for a single nozzle.
 * Handles normal closing - opening, pump testing calibration litres, and meter reset/rollover.
 */
export function calculateNozzleLitres(input: NozzleCalcInput): NozzleCalcResult {
  const opening = new Decimal(input.openingReading);
  const closing = new Decimal(input.closingReading);
  const testing = input.testingLitres ? new Decimal(input.testingLitres) : new Decimal(0);

  let rawLitres: Decimal;

  if (input.isMeterReset) {
    if (input.resetLitres !== undefined && input.resetLitres !== null) {
      rawLitres = new Decimal(input.resetLitres);
    } else if (input.meterMaxReading !== undefined && input.meterMaxReading !== null) {
      const meterMax = new Decimal(input.meterMaxReading);
      rawLitres = meterMax.minus(opening).plus(closing);
    } else {
      throw new Error('Meter reset indicated but neither meterMaxReading nor resetLitres was provided');
    }
  } else {
    if (closing.lessThan(opening)) {
      throw new Error(
        `Closing reading (${closing.toString()}) cannot be less than opening reading (${opening.toString()}) without isMeterReset set to true`
      );
    }
    rawLitres = closing.minus(opening);
  }

  const netLitres = rawLitres.minus(testing);
  if (netLitres.isNegative()) {
    throw new Error(`Testing litres (${testing.toString()}) cannot exceed dispensed litres (${rawLitres.toString()})`);
  }

  // Rounded to 2 decimals per client notebook rule
  const roundedLitres = netLitres.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const litresCenti = roundedLitres.times(100).round().toNumber();

  return {
    nozzleId: input.nozzleId,
    productId: input.productId,
    openingReading: opening.toFixed(3),
    closingReading: closing.toFixed(3),
    testingLitres: testing.toFixed(2),
    litres: roundedLitres.toFixed(2),
    litresCenti,
  };
}

/**
 * Groups nozzle litres by product and applies the configured rate and rounding mode.
 * Client notebook rule:
 * product litres = sum of 2-decimal nozzle litres.
 * product amount = truncate(litres * rate, 2) [default] or roundHalfUp.
 */
export function calculateProductTotals(
  nozzleResults: NozzleCalcResult[],
  rates: ProductRateInput[],
  roundingMode: RoundingMode = RoundingMode.TRUNCATE
): ProductTotalResult[] {
  const rateMap = new Map<string, number>();
  for (const r of rates) {
    rateMap.set(r.productId, r.ratePaise);
  }

  // Group litres by product
  const productLitresMap = new Map<string, Decimal>();
  for (const n of nozzleResults) {
    const current = productLitresMap.get(n.productId) || new Decimal(0);
    productLitresMap.set(n.productId, current.plus(new Decimal(n.litres)));
  }

  const results: ProductTotalResult[] = [];

  for (const [productId, sumLitres] of productLitresMap.entries()) {
    const ratePaise = rateMap.get(productId);
    if (ratePaise === undefined) {
      throw new Error(`Missing rate for product ID: ${productId}`);
    }

    const rateRupees = new Decimal(ratePaise).dividedBy(100);
    const rawAmount = sumLitres.times(rateRupees);

    let finalAmountRupees: Decimal;
    if (roundingMode === RoundingMode.TRUNCATE) {
      finalAmountRupees = rawAmount.toDecimalPlaces(2, Decimal.ROUND_DOWN);
    } else {
      finalAmountRupees = rawAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    const amountPaise = finalAmountRupees.times(100).round().toNumber();
    const litresCenti = sumLitres.times(100).round().toNumber();

    results.push({
      productId,
      litres: sumLitres.toFixed(2),
      litresCenti,
      ratePaise,
      rateRupees: rateRupees.toFixed(2),
      amountPaise,
      amountRupees: finalAmountRupees.toFixed(2),
    });
  }

  return results;
}

/**
 * Computes payment totals broken down by mode.
 */
export function calculatePaymentsSummary(payments: PaymentItemInput[]): PaymentsSummaryResult {
  let cash = 0;
  let online = 0;
  let card = 0;
  let credit = 0;

  for (const p of payments) {
    switch (p.mode) {
      case PaymentMode.CASH:
        cash += p.amountPaise;
        break;
      case PaymentMode.ONLINE:
        online += p.amountPaise;
        break;
      case PaymentMode.CARD:
        card += p.amountPaise;
        break;
      case PaymentMode.CREDIT:
        credit += p.amountPaise;
        break;
    }
  }

  const totalCollected = cash + online + card + credit;

  return {
    cashPaise: cash,
    onlinePaise: online,
    cardPaise: card,
    creditPaise: credit,
    totalCollectedPaise: totalCollected,
    cashRupees: new Decimal(cash).dividedBy(100).toFixed(2),
    onlineRupees: new Decimal(online).dividedBy(100).toFixed(2),
    cardRupees: new Decimal(card).dividedBy(100).toFixed(2),
    creditRupees: new Decimal(credit).dividedBy(100).toFixed(2),
    totalCollectedRupees: new Decimal(totalCollected).dividedBy(100).toFixed(2),
  };
}

/**
 * Complete Sheet calculation: nozzles -> products -> total amount -> collections -> short/excess.
 */
export function calculateSheet(params: {
  nozzles: NozzleCalcInput[];
  rates: ProductRateInput[];
  payments: PaymentItemInput[];
  roundingMode?: RoundingMode;
  tolerancePaise?: number;
}): SheetCalculationResult {
  const roundingMode = params.roundingMode ?? RoundingMode.TRUNCATE;
  const tolerancePaise = params.tolerancePaise ?? 1000; // default ₹10 tolerance

  const nozzleResults = params.nozzles.map((n) => calculateNozzleLitres(n));
  const productTotals = calculateProductTotals(nozzleResults, params.rates, roundingMode);

  let totalAmountPaise = 0;
  for (const pt of productTotals) {
    totalAmountPaise += pt.amountPaise;
  }
  const totalAmountRupees = new Decimal(totalAmountPaise).dividedBy(100).toFixed(2);

  const collections = calculatePaymentsSummary(params.payments);
  const shortExcessPaise = collections.totalCollectedPaise - totalAmountPaise;
  const shortExcessRupees = new Decimal(shortExcessPaise).dividedBy(100).toFixed(2);

  return {
    nozzleResults,
    productTotals,
    totalAmountPaise,
    totalAmountRupees,
    collections,
    shortExcessPaise,
    shortExcessRupees,
    isShort: shortExcessPaise < 0,
    isExcess: shortExcessPaise > 0,
    isBalanced: shortExcessPaise === 0,
    isWithinTolerance: Math.abs(shortExcessPaise) <= tolerancePaise,
  };
}

export interface DenominationInput {
  note: DenominationNote;
  count: number;
}

export interface CashHandoverInput {
  label: string;
  staffId?: string;
  amountPaise: number;
}

export interface DayClosingCalculationInput {
  sheetCashTotalPaise: number;
  sheetOnlineTotalPaise: number;
  additionalCashHandovers?: CashHandoverInput[];
  expensesPaise?: number;
  denominations: DenominationInput[];
}

export interface DayClosingCalculationResult {
  totalOnlinePaise: number;
  totalOnlineRupees: string;
  expectedCashPaise: number;
  expectedCashRupees: string;
  denominationTotalPaise: number;
  denominationTotalRupees: string;
  cashDifferencePaise: number; // denominationTotal - expectedCash
  cashDifferenceRupees: string;
  isBalanced: boolean;
}

/**
 * Calculates Day Closing cash reconciliation:
 * - Online total across all sheets
 * - Expected cash = sheet cash + additional cash lines - expenses
 * - Denomination total = sum(count * note_value)
 * - Cash difference = denomination total - expected cash (0 = perfect match)
 */
export function calculateDayClosing(input: DayClosingCalculationInput): DayClosingCalculationResult {
  let additionalCash = 0;
  if (input.additionalCashHandovers) {
    for (const h of input.additionalCashHandovers) {
      additionalCash += h.amountPaise;
    }
  }

  const expenses = input.expensesPaise ?? 0;
  const expectedCashPaise = input.sheetCashTotalPaise + additionalCash - expenses;

  let denominationTotalPaise = 0;
  for (const d of input.denominations) {
    if (d.note === 'coins') {
      denominationTotalPaise += toPaise(d.count); // coins in rupees or count
    } else {
      const noteVal = typeof d.note === 'number' ? d.note : parseInt(String(d.note), 10);
      denominationTotalPaise += toPaise(noteVal * d.count);
    }
  }

  const cashDifferencePaise = denominationTotalPaise - expectedCashPaise;

  return {
    totalOnlinePaise: input.sheetOnlineTotalPaise,
    totalOnlineRupees: new Decimal(input.sheetOnlineTotalPaise).dividedBy(100).toFixed(2),
    expectedCashPaise,
    expectedCashRupees: new Decimal(expectedCashPaise).dividedBy(100).toFixed(2),
    denominationTotalPaise,
    denominationTotalRupees: new Decimal(denominationTotalPaise).dividedBy(100).toFixed(2),
    cashDifferencePaise,
    cashDifferenceRupees: new Decimal(cashDifferencePaise).dividedBy(100).toFixed(2),
    isBalanced: cashDifferencePaise === 0,
  };
}

