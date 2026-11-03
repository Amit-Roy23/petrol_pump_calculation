import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  Role,
  RoundingMode,
  Currency,
  ProductUnit,
  SheetStatus,
  Shift,
  PaymentMode,
  CreditLedgerType,
  DayClosingStatus,
  toPaise,
  toMilliUnits,
  toCentiLitres,
} from '@petrolpump/shared';
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { StationModel } from '../models/Station.js';
import { UserModel } from '../models/User.js';
import { StaffModel } from '../models/Staff.js';
import { ProductModel } from '../models/Product.js';
import { RateHistoryModel } from '../models/RateHistory.js';
import { MachineModel } from '../models/Machine.js';
import { NozzleModel } from '../models/Nozzle.js';
import { CreditCustomerModel } from '../models/CreditCustomer.js';
import { CreditLedgerEntryModel } from '../models/CreditLedgerEntry.js';
import { DailySheetModel } from '../models/DailySheet.js';
import { DayClosingModel } from '../models/DayClosing.js';

export async function runSeed(dropExisting = true) {
  try {
    await connectDB();
    logger.info('Starting database seed...');

    if (dropExisting) {
      await mongoose.connection.dropDatabase();
      logger.info('Dropped existing database for clean seed');
    }

    // 1. Station
    const station = await StationModel.create({
      name: 'Kalyani Highway Fuel Station',
      address: 'NH-34 Kalyani Crossing, Nadia, West Bengal',
      gstin: '19AAACK1234F1Z5',
      settings: {
        roundingMode: RoundingMode.TRUNCATE,
        currency: Currency.INR,
        shortExcessTolerancePaise: 1000,
        dayStartTime: '06:00',
      },
    });
    logger.info(`Seeded Station: ${station.name}`);

    // 2. Owner User
    const passwordHash = await bcrypt.hash(env.DEFAULT_OWNER_PASSWORD, 10);
    const pinHash = await bcrypt.hash(env.DEFAULT_OWNER_PIN, 10);

    const owner = await UserModel.create({
      stationId: station._id,
      name: 'Station Owner',
      phone: env.DEFAULT_OWNER_PHONE,
      email: 'owner@kalyanifuel.com',
      passwordHash,
      pinHash,
      role: Role.OWNER,
      isActive: true,
    });
    logger.info(`Seeded Owner User: ${owner.phone}`);

    // 3. Products
    // TODO: Confirm with client whether Product B (114.15/L) is Diesel or Premium Petrol
    const effectiveDate = new Date('2026-06-19T00:00:00.000Z');

    const productA = await ProductModel.create({
      stationId: station._id,
      name: 'Petrol',
      shortCode: 'PETROL',
      unit: ProductUnit.L,
      colourTag: '#10b981',
      currentRatePaise: toPaise(100.45),
      isActive: true,
    });

    const productB = await ProductModel.create({
      stationId: station._id,
      name: 'Product B', // Renameable in UI once confirmed
      shortCode: 'PROD_B',
      unit: ProductUnit.L,
      colourTag: '#3b82f6',
      currentRatePaise: toPaise(114.15),
      isActive: true,
    });

    // Rate histories
    await RateHistoryModel.create([
      {
        stationId: station._id,
        productId: productA._id,
        ratePaise: toPaise(100.45),
        effectiveFrom: effectiveDate,
        setBy: owner._id,
      },
      {
        stationId: station._id,
        productId: productB._id,
        ratePaise: toPaise(114.15),
        effectiveFrom: effectiveDate,
        setBy: owner._id,
      },
    ]);

    // 4. Attendants / Staff
    const staff1 = await StaffModel.create({
      stationId: station._id,
      name: 'Attendant 219',
      code: 'ATT-219',
      phone: '9876500219',
    });

    const staff2 = await StaffModel.create({
      stationId: station._id,
      name: 'Attendant 285',
      code: 'ATT-285',
      phone: '9876500285',
    });

    // 5. Machines and Nozzles
    // Machine 219
    const machine219 = await MachineModel.create({
      stationId: station._id,
      number: '219',
      name: 'Dispenser Unit 219',
      displayOrder: 1,
    });

    // Machine 285
    const machine285 = await MachineModel.create({
      stationId: station._id,
      number: '285',
      name: 'Dispenser Unit 285',
      displayOrder: 2,
    });

    // Nozzles for 219 (closing from 19/06/2026 becomes lastClosingReading)
    const m219_n1 = await NozzleModel.create({
      stationId: station._id,
      machineId: machine219._id,
      position: 1,
      productId: productA._id,
      lastClosingReadingMilli: toMilliUnits('2127216.665'),
    });

    const m219_n2 = await NozzleModel.create({
      stationId: station._id,
      machineId: machine219._id,
      position: 2,
      productId: productA._id,
      lastClosingReadingMilli: toMilliUnits('1566562.055'),
    });

    const m219_n3 = await NozzleModel.create({
      stationId: station._id,
      machineId: machine219._id,
      position: 3,
      productId: productB._id,
      lastClosingReadingMilli: toMilliUnits('209353.040'),
    });

    const m219_n4 = await NozzleModel.create({
      stationId: station._id,
      machineId: machine219._id,
      position: 4,
      productId: productB._id,
      lastClosingReadingMilli: toMilliUnits('440908.700'),
    });

    // Nozzles for 285
    const m285_n1 = await NozzleModel.create({
      stationId: station._id,
      machineId: machine285._id,
      position: 1,
      productId: productA._id,
      lastClosingReadingMilli: toMilliUnits('2101384.468'),
    });

    const m285_n2 = await NozzleModel.create({
      stationId: station._id,
      machineId: machine285._id,
      position: 2,
      productId: productA._id,
      lastClosingReadingMilli: toMilliUnits('1727701.973'),
    });

    const m285_n3 = await NozzleModel.create({
      stationId: station._id,
      machineId: machine285._id,
      position: 3,
      productId: productB._id,
      lastClosingReadingMilli: toMilliUnits('379646.739'),
    });

    const m285_n4 = await NozzleModel.create({
      stationId: station._id,
      machineId: machine285._id,
      position: 4,
      productId: productB._id,
      lastClosingReadingMilli: toMilliUnits('270788.978'),
    });

    // 6. Credit Customer
    const creditCustomer = await CreditCustomerModel.create({
      stationId: station._id,
      name: 'M/s Ghosh Transport (বাকি গ্রাহক)',
      phone: '9830012345',
      vehicleNumbers: ['WB-04-1234', 'WB-04-5678'],
      address: 'Kalyani Industrial Area',
      creditLimitPaise: toPaise(50000),
      openingBalancePaise: 0,
      currentBalancePaise: toPaise(11451), // updated after Sheet 2
    });

    // 7. Seed Section 1.1 Sheet 1 (Machine 219 on 2026-06-19)
    const m219OnlineList = [1160, 114, 500, 210, 220, 200, 100, 20, 888, 120, 100, 1200, 350, 100];
    const sheet1 = await DailySheetModel.create({
      stationId: station._id,
      businessDate: '2026-06-19',
      shift: Shift.DAY,
      machineId: machine219._id,
      staffId: staff1._id,
      status: SheetStatus.SUBMITTED,
      nozzleReadings: [
        {
          nozzleId: m219_n1._id,
          productId: productA._id,
          openingMilli: toMilliUnits('2127209.495'),
          closingMilli: toMilliUnits('2127216.665'),
          testingLitresCenti: 0,
          litresCenti: toCentiLitres('7.17'),
        },
        {
          nozzleId: m219_n2._id,
          productId: productA._id,
          openingMilli: toMilliUnits('1566447.455'),
          closingMilli: toMilliUnits('1566562.055'),
          testingLitresCenti: 0,
          litresCenti: toCentiLitres('114.60'),
        },
        {
          nozzleId: m219_n3._id,
          productId: productB._id,
          openingMilli: toMilliUnits('209343.220'),
          closingMilli: toMilliUnits('209353.040'),
          testingLitresCenti: 0,
          litresCenti: toCentiLitres('9.82'),
        },
        {
          nozzleId: m219_n4._id,
          productId: productB._id,
          openingMilli: toMilliUnits('440779.120'),
          closingMilli: toMilliUnits('440908.700'),
          testingLitresCenti: 0,
          litresCenti: toCentiLitres('129.58'),
        },
      ],
      productTotals: [
        {
          productId: productA._id,
          litresCenti: toCentiLitres('121.77'),
          ratePaise: toPaise(100.45),
          amountPaise: 1223179, // 12,231.79
        },
        {
          productId: productB._id,
          litresCenti: toCentiLitres('139.40'),
          ratePaise: toPaise(114.15),
          amountPaise: 1591251, // 15,912.51
        },
      ],
      totalAmountPaise: 2814430, // 28,144.30
      payments: [
        { mode: PaymentMode.CASH, amountPaise: toPaise(22525) },
        ...m219OnlineList.map((amt) => ({
          mode: PaymentMode.ONLINE,
          amountPaise: toPaise(amt),
          reference: 'UPI',
        })),
        { mode: PaymentMode.CARD, amountPaise: toPaise(333), reference: 'SWIPE' },
      ],
      cashTotalPaise: toPaise(22525),
      onlineTotalPaise: toPaise(5282),
      cardTotalPaise: toPaise(333),
      creditTotalPaise: 0,
      totalCollectedPaise: toPaise(28140),
      shortExcessPaise: -430, // Short 4.30
      closedAtTime: '18:44',
      submittedBy: owner._id,
      submittedAt: new Date('2026-06-19T18:45:00Z'),
    });

    // 8. Seed Section 1.1 Sheet 2 (Machine 285 on 2026-06-19)
    const m285OnlineList = [520, 110, 14, 60, 230, 40, 200, 150, 101, 350, 100, 200, 3700];
    const sheet2 = await DailySheetModel.create({
      stationId: station._id,
      businessDate: '2026-06-19',
      shift: Shift.DAY,
      machineId: machine285._id,
      staffId: staff2._id,
      status: SheetStatus.SUBMITTED,
      nozzleReadings: [
        {
          nozzleId: m285_n1._id,
          productId: productA._id,
          openingMilli: toMilliUnits('2101128.148'),
          closingMilli: toMilliUnits('2101384.468'),
          testingLitresCenti: 0,
          litresCenti: toCentiLitres('256.32'),
        },
        {
          nozzleId: m285_n2._id,
          productId: productA._id,
          openingMilli: toMilliUnits('1727476.473'),
          closingMilli: toMilliUnits('1727701.973'),
          testingLitresCenti: 0,
          litresCenti: toCentiLitres('225.50'),
        },
        {
          nozzleId: m285_n3._id,
          productId: productB._id,
          openingMilli: toMilliUnits('379571.089'),
          closingMilli: toMilliUnits('379646.739'),
          testingLitresCenti: 0,
          litresCenti: toCentiLitres('75.65'),
        },
        {
          nozzleId: m285_n4._id,
          productId: productB._id,
          openingMilli: toMilliUnits('270753.198'),
          closingMilli: toMilliUnits('270788.978'),
          testingLitresCenti: 0,
          litresCenti: toCentiLitres('35.78'),
        },
      ],
      productTotals: [
        {
          productId: productA._id,
          litresCenti: toCentiLitres('481.82'),
          ratePaise: toPaise(100.45),
          amountPaise: 4839881, // 48,398.81
        },
        {
          productId: productB._id,
          litresCenti: toCentiLitres('111.43'),
          ratePaise: toPaise(114.15),
          amountPaise: 1271973, // 12,719.73
        },
      ],
      totalAmountPaise: 6111854, // 61,118.54
      payments: [
        { mode: PaymentMode.CASH, amountPaise: toPaise(43885) },
        ...m285OnlineList.map((amt) => ({
          mode: PaymentMode.ONLINE,
          amountPaise: toPaise(amt),
          reference: 'UPI',
        })),
        {
          mode: PaymentMode.CREDIT,
          amountPaise: toPaise(11451),
          creditCustomerId: creditCustomer._id,
          note: 'Diesel/Petrol credit sale for M/s Ghosh Transport',
        },
      ],
      cashTotalPaise: toPaise(43885),
      onlineTotalPaise: toPaise(5775),
      cardTotalPaise: 0,
      creditTotalPaise: toPaise(11451),
      totalCollectedPaise: toPaise(61111),
      shortExcessPaise: -754, // Short 7.54
      closedAtTime: '17:28',
      submittedBy: owner._id,
      submittedAt: new Date('2026-06-19T17:30:00Z'),
    });

    // Credit ledger entry for Sheet 2 credit sale
    await CreditLedgerEntryModel.create({
      stationId: station._id,
      creditCustomerId: creditCustomer._id,
      date: effectiveDate,
      type: CreditLedgerType.SALE,
      amountPaise: toPaise(11451),
      sheetId: sheet2._id,
      note: 'Fuel credit sale against Machine 285',
    });

    // 9. Seed Section 1.1 Day Closing (19/06/2026)
    const dayClosing = await DayClosingModel.create({
      stationId: station._id,
      businessDate: '2026-06-19',
      sheetIds: [sheet1._id, sheet2._id],
      productTotals: [
        {
          productId: productA._id,
          litresCenti: toCentiLitres('603.59'), // 121.77 + 481.82
          amountPaise: 1223179 + 4839881,
        },
        {
          productId: productB._id,
          litresCenti: toCentiLitres('250.83'), // 139.40 + 111.43
          amountPaise: 1591251 + 1271973,
        },
      ],
      cashTotalPaise: toPaise(22525 + 43885), // 66,410.00
      onlineTotalPaise: toPaise(5282 + 5775), // 11,057.00
      cardTotalPaise: toPaise(333),
      creditTotalPaise: toPaise(11451),
      totalCollectedPaise: toPaise(28140 + 61111),
      cashHandovers: [
        { label: 'Attendant (sheet 285)', staffId: staff2._id, amountPaise: toPaise(43885) },
        { label: 'Attendant (sheet 219)', staffId: staff1._id, amountPaise: toPaise(22525) },
        { label: 'Other', amountPaise: toPaise(50) },
      ],
      denominations: [
        { note: 500, count: 92 },
        { note: 200, count: 35 },
        { note: 100, count: 133 },
        { note: 20, count: 6 },
        { note: 10, count: 4 },
      ],
      denominationTotalPaise: toPaise(66460),
      cashDifferencePaise: 0, // Matched!
      status: DayClosingStatus.CLOSED,
      closedBy: owner._id,
      closedAt: new Date('2026-06-19T20:00:00Z'),
      remarks: 'Reconciled and closed. All cash matched notebook count.',
    });

    logger.info(`Seeded Day Closing for 2026-06-19. Denomination Total: ₹66,460.00 (Balanced)`);
    logger.info('Database seed completed successfully!');
  } catch (error) {
    logger.error({ err: error }, 'Seed script failed');
    throw error;
  }
}

// Allow direct execution
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  runSeed()
    .then(async () => {
      await disconnectDB();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await disconnectDB();
      process.exit(1);
    });
}

