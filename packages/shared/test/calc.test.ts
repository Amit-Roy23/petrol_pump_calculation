import { describe, it, expect } from 'vitest';
import {
  calculateNozzleLitres,
  calculateProductTotals,
  calculatePaymentsSummary,
  calculateSheet,
  calculateDayClosing,
} from '../src/calc/index.js';
import { RoundingMode, PaymentMode } from '../src/enums.js';
import { toPaise } from '../src/utils/money.js';

describe('Shared Calculation Engine - Client Notebook Verifications', () => {
  // Test data constants from section 1.1
  const RATE_PRODUCT_A = 10045; // 100.45 per L
  const RATE_PRODUCT_B = 11415; // 114.15 per L

  it('Section 1.1 Sheet 1 (Machine 219) - exactly matches client notebook values', () => {
    // Nozzle readings:
    // N1 (A): 2127209.495 -> 2127216.665 (7.17 L)
    // N2 (A): 1566447.455 -> 1566562.055 (114.60 L)
    // N3 (B): 209343.220 -> 209353.040 (9.82 L)
    // N4 (B): 440779.120 -> 440908.700 (129.58 L)
    const nozzles = [
      { nozzleId: 'n1', productId: 'prod_a', openingReading: '2127209.495', closingReading: '2127216.665' },
      { nozzleId: 'n2', productId: 'prod_a', openingReading: '1566447.455', closingReading: '1566562.055' },
      { nozzleId: 'n3', productId: 'prod_b', openingReading: '209343.220', closingReading: '209353.040' },
      { nozzleId: 'n4', productId: 'prod_b', openingReading: '440779.120', closingReading: '440908.700' },
    ];

    const rates = [
      { productId: 'prod_a', ratePaise: RATE_PRODUCT_A },
      { productId: 'prod_b', ratePaise: RATE_PRODUCT_B },
    ];

    // Payments:
    // Cash: 22,525.00
    // Online entries: 1160, 114, 500, 210, 220, 200, 100, 20, 888, 120, 100, 1200, 350, 100 (= 5,282.00)
    // Card: 333.00
    const onlineAmounts = [1160, 114, 500, 210, 220, 200, 100, 20, 888, 120, 100, 1200, 350, 100];
    const onlineTotal = onlineAmounts.reduce((a, b) => a + b, 0);
    expect(onlineTotal).toBe(5282);

    const payments = [
      { mode: PaymentMode.CASH, amountPaise: toPaise(22525) },
      ...onlineAmounts.map((amt) => ({ mode: PaymentMode.ONLINE, amountPaise: toPaise(amt) })),
      { mode: PaymentMode.CARD, amountPaise: toPaise(333) },
    ];

    const result = calculateSheet({
      nozzles,
      rates,
      payments,
      roundingMode: RoundingMode.TRUNCATE,
    });

    // Check individual nozzles
    expect(result.nozzleResults[0].litres).toBe('7.17');
    expect(result.nozzleResults[1].litres).toBe('114.60');
    expect(result.nozzleResults[2].litres).toBe('9.82');
    expect(result.nozzleResults[3].litres).toBe('129.58');

    // Product A: 121.77 L x 100.45 = 12,231.79
    const prodA = result.productTotals.find((p) => p.productId === 'prod_a')!;
    expect(prodA.litres).toBe('121.77');
    expect(prodA.amountRupees).toBe('12231.79');
    expect(prodA.amountPaise).toBe(1223179);

    // Product B: 139.40 L x 114.15 = 15,912.51
    const prodB = result.productTotals.find((p) => p.productId === 'prod_b')!;
    expect(prodB.litres).toBe('139.40');
    expect(prodB.amountRupees).toBe('15912.51');
    expect(prodB.amountPaise).toBe(1591251);

    // Total Amount: 12,231.79 + 15,912.51 = 28,144.30
    expect(result.totalAmountRupees).toBe('28144.30');
    expect(result.totalAmountPaise).toBe(2814430);

    // Collections: Cash 22,525.00 + Online 5,282.00 + Card 333.00 = 28,140.00
    expect(result.collections.cashRupees).toBe('22525.00');
    expect(result.collections.onlineRupees).toBe('5282.00');
    expect(result.collections.cardRupees).toBe('333.00');
    expect(result.collections.totalCollectedRupees).toBe('28140.00');

    // Short/Excess: 28,140.00 - 28,144.30 = short 4.30 (-4.30)
    expect(result.shortExcessRupees).toBe('-4.30');
    expect(result.shortExcessPaise).toBe(-430);
    expect(result.isShort).toBe(true);
  });

  it('Section 1.1 Sheet 2 (Machine 285) - exactly matches client notebook values', () => {
    // Nozzle readings:
    // N1 (A): 2101128.148 -> 2101384.468 (256.32 L)
    // N2 (A): 1727476.473 -> 1727701.973 (225.50 L)
    // N3 (B): 379571.089 -> 379646.739 (75.65 L)
    // N4 (B): 270753.198 -> 270788.978 (35.78 L)
    const nozzles = [
      { nozzleId: 'n1', productId: 'prod_a', openingReading: '2101128.148', closingReading: '2101384.468' },
      { nozzleId: 'n2', productId: 'prod_a', openingReading: '1727476.473', closingReading: '1727701.973' },
      { nozzleId: 'n3', productId: 'prod_b', openingReading: '379571.089', closingReading: '379646.739' },
      { nozzleId: 'n4', productId: 'prod_b', openingReading: '270753.198', closingReading: '270788.978' },
    ];

    const rates = [
      { productId: 'prod_a', ratePaise: RATE_PRODUCT_A },
      { productId: 'prod_b', ratePaise: RATE_PRODUCT_B },
    ];

    // Payments:
    // Cash: 43,885.00
    // Online entries: 520, 110, 14, 60, 230, 40, 200, 150, 101, 350, 100, 200, 3700 (= 5,775.00)
    // Due (Credit): 11,451.00
    const onlineAmounts = [520, 110, 14, 60, 230, 40, 200, 150, 101, 350, 100, 200, 3700];
    const onlineTotal = onlineAmounts.reduce((a, b) => a + b, 0);
    expect(onlineTotal).toBe(5775);

    const payments = [
      { mode: PaymentMode.CASH, amountPaise: toPaise(43885) },
      ...onlineAmounts.map((amt) => ({ mode: PaymentMode.ONLINE, amountPaise: toPaise(amt) })),
      { mode: PaymentMode.CREDIT, amountPaise: toPaise(11451), creditCustomerId: 'cust_credit_1' },
    ];

    const result = calculateSheet({
      nozzles,
      rates,
      payments,
      roundingMode: RoundingMode.TRUNCATE,
    });

    expect(result.nozzleResults[0].litres).toBe('256.32');
    expect(result.nozzleResults[1].litres).toBe('225.50');
    expect(result.nozzleResults[2].litres).toBe('75.65');
    expect(result.nozzleResults[3].litres).toBe('35.78');

    // Product A: 481.82 L x 100.45 = 48,398.81
    const prodA = result.productTotals.find((p) => p.productId === 'prod_a')!;
    expect(prodA.litres).toBe('481.82');
    expect(prodA.amountRupees).toBe('48398.81');
    expect(prodA.amountPaise).toBe(4839881);

    // Product B: 111.43 L x 114.15 = 12,719.73
    const prodB = result.productTotals.find((p) => p.productId === 'prod_b')!;
    expect(prodB.litres).toBe('111.43');
    expect(prodB.amountRupees).toBe('12719.73');
    expect(prodB.amountPaise).toBe(1271973);

    // Total Amount: 48,398.81 + 12,719.73 = 61,118.54
    expect(result.totalAmountRupees).toBe('61118.54');
    expect(result.totalAmountPaise).toBe(6111854);

    // Collections: Cash 43,885.00 + Online 5,775.00 + Due 11,451.00 = 61,111.00
    expect(result.collections.cashRupees).toBe('43885.00');
    expect(result.collections.onlineRupees).toBe('5775.00');
    expect(result.collections.creditRupees).toBe('11451.00');
    expect(result.collections.totalCollectedRupees).toBe('61111.00');

    // Short/Excess: 61,111.00 - 61,118.54 = short 7.54 (-7.54)
    expect(result.shortExcessRupees).toBe('-7.54');
    expect(result.shortExcessPaise).toBe(-754);
    expect(result.isShort).toBe(true);
  });

  it('Section 1.1 Day Summary (19/06/2026) - denomination reconciliation matches', () => {
    // Online total: 5,282 + 5,775 = 11,057.00
    const sheetOnlineTotalPaise = toPaise(5282 + 5775);

    // Cash from attendants: 43,885.00 + 22,525.00 = 66,410.00
    // Plus Other cash: 50.00 -> total expected cash = 66,460.00
    const sheetCashTotalPaise = toPaise(43885 + 22525);
    const additionalCashHandovers = [
      { label: 'Other', amountPaise: toPaise(50) },
    ];

    // Denominations: 500x92 = 46,000; 200x35 = 7,000; 100x133 = 13,300; 20x6 = 120; 10x4 = 40
    const denominations = [
      { note: 500 as const, count: 92 },
      { note: 200 as const, count: 35 },
      { note: 100 as const, count: 133 },
      { note: 20 as const, count: 6 },
      { note: 10 as const, count: 4 },
    ];

    const closingResult = calculateDayClosing({
      sheetCashTotalPaise,
      sheetOnlineTotalPaise,
      additionalCashHandovers,
      denominations,
    });

    expect(closingResult.totalOnlineRupees).toBe('11057.00');
    expect(closingResult.expectedCashRupees).toBe('66460.00');
    expect(closingResult.denominationTotalRupees).toBe('66460.00');
    expect(closingResult.cashDifferenceRupees).toBe('0.00');
    expect(closingResult.cashDifferencePaise).toBe(0);
    expect(closingResult.isBalanced).toBe(true);
  });

  it('Correctly compares TRUNCATE vs ROUND_HALF_UP rounding modes', () => {
    // 121.77 x 100.45 = 12231.7965
    const nozzleResults = [
      {
        productId: 'prod_a',
        openingReading: '0.000',
        closingReading: '121.770',
        testingLitres: '0.00',
        litres: '121.77',
        litresCenti: 12177,
      },
    ];
    const rates = [{ productId: 'prod_a', ratePaise: 10045 }];

    // TRUNCATE: 12231.7965 -> 12231.79
    const truncated = calculateProductTotals(nozzleResults, rates, RoundingMode.TRUNCATE);
    expect(truncated[0].amountRupees).toBe('12231.79');
    expect(truncated[0].amountPaise).toBe(1223179);

    // ROUND_HALF_UP: 12231.7965 -> 12231.80
    const rounded = calculateProductTotals(nozzleResults, rates, RoundingMode.ROUND_HALF_UP);
    expect(rounded[0].amountRupees).toBe('12231.80');
    expect(rounded[0].amountPaise).toBe(1223180);
  });

  it('Handles pump calibration testing litres correctly', () => {
    const result = calculateNozzleLitres({
      productId: 'prod_a',
      openingReading: '100.000',
      closingReading: '120.000', // 20 litres dispensed
      testingLitres: '5.000', // 5 litres returned to underground tank
    });
    // 20 - 5 = 15.00 litres
    expect(result.litres).toBe('15.00');
    expect(result.litresCenti).toBe(1500);
  });

  it('Handles meter reset and rollover with rollover math and manual override', () => {
    // Rollover: meter was at 999990.000, rolled over max 1000000.000 to 000020.000
    const rolloverResult = calculateNozzleLitres({
      productId: 'prod_a',
      openingReading: '999990.000',
      closingReading: '20.000',
      isMeterReset: true,
      meterMaxReading: '1000000.000',
    });
    // (1000000 - 999990) + 20 = 10 + 20 = 30 litres
    expect(rolloverResult.litres).toBe('30.00');

    // Replacement with manual override litres
    const manualResetResult = calculateNozzleLitres({
      productId: 'prod_a',
      openingReading: '500.000',
      closingReading: '10.000',
      isMeterReset: true,
      resetLitres: '45.50',
    });
    expect(manualResetResult.litres).toBe('45.50');
  });

  it('Rejects closing reading less than opening reading without isMeterReset', () => {
    expect(() =>
      calculateNozzleLitres({
        productId: 'prod_a',
        openingReading: '100.000',
        closingReading: '99.500',
      })
    ).toThrow('Closing reading (99.5) cannot be less than opening reading (100) without isMeterReset');
  });

  it('Property test: no float drift over 1000 randomized calculations', () => {
    for (let i = 0; i < 1000; i++) {
      const opening = Math.floor(Math.random() * 1000000) / 1000;
      const dispensed = Math.floor(Math.random() * 50000) / 1000;
      const closing = opening + dispensed;

      const nozzle = calculateNozzleLitres({
        productId: 'prod_p',
        openingReading: opening.toFixed(3),
        closingReading: closing.toFixed(3),
      });

      // Integer centi-litres must strictly match Decimal string x 100
      expect(Number.isInteger(nozzle.litresCenti)).toBe(true);
      expect(nozzle.litresCenti).toBe(Math.round(parseFloat(nozzle.litres) * 100));
    }
  });
});

