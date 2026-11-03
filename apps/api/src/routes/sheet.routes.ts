import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import {
  Role,
  SheetStatus,
  CreditLedgerType,
  AuditAction,
  CreateDailySheetSchema,
  UpdateDailySheetSchema,
  PreviewSheetSchema,
  calculateSheet,
  calculateNozzleLitres,
  fromMilliUnits,
  fromCentiLitres,
  fromPaise,
  RoundingMode,
} from '@petrolpump/shared';
import { DailySheetModel } from '../models/DailySheet.js';
import { NozzleModel } from '../models/Nozzle.js';
import { ProductModel } from '../models/Product.js';
import { RateHistoryModel } from '../models/RateHistory.js';
import { CreditCustomerModel } from '../models/CreditCustomer.js';
import { CreditLedgerEntryModel } from '../models/CreditLedgerEntry.js';
import { AuditLogModel } from '../models/AuditLog.js';
import { StationModel } from '../models/Station.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const sheetRouter = Router();

sheetRouter.use(authenticateToken);

// Stateless calculation preview for live editing
sheetRouter.post('/preview', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = PreviewSheetSchema.parse(req.body);
    const station = await StationModel.findById(req.stationId);
    const roundingMode = (data.roundingMode as RoundingMode) || station?.settings?.roundingMode || RoundingMode.TRUNCATE;
    const tolerance = station?.settings?.shortExcessTolerancePaise ?? 1000;

    const calcResult = calculateSheet({
      nozzles: data.nozzleReadings.map((n) => ({
        nozzleId: n.nozzleId,
        productId: n.productId,
        openingReading: fromMilliUnits(n.openingMilli),
        closingReading: fromMilliUnits(n.closingMilli),
        testingLitres: fromCentiLitres(n.testingLitresCenti),
        isMeterReset: n.isMeterReset,
        resetLitres: n.resetLitresCenti ? fromCentiLitres(n.resetLitresCenti) : undefined,
      })),
      rates: data.rates,
      payments: data.payments,
      roundingMode,
      tolerancePaise: tolerance,
    });

    res.json({ preview: calcResult });
  } catch (error) {
    next(error);
  }
});

// List sheets
sheetRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filter: Record<string, unknown> = { stationId: req.stationId };
    if (req.query.date) filter.businessDate = req.query.date;
    if (req.query.machineId) filter.machineId = req.query.machineId;
    if (req.query.status) filter.status = req.query.status;

    // Attendant can only view own sheets unless manager/owner
    if (req.user?.role === Role.ATTENDANT && !req.query.all) {
      // Find staff linked to user
      filter.staffId = req.user.userId;
    }

    const sheets = await DailySheetModel.find(filter)
      .populate('machineId', 'number name')
      .populate('staffId', 'name code')
      .sort({ businessDate: -1, createdAt: -1 });

    res.json({ sheets });
  } catch (error) {
    next(error);
  }
});

// Create new sheet draft with auto-filled nozzle openings and snapshotted rates
sheetRouter.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = CreateDailySheetSchema.parse(req.body);

    const existing = await DailySheetModel.findOne({
      stationId: req.stationId,
      businessDate: data.businessDate,
      machineId: data.machineId,
      shift: data.shift,
    });

    if (existing) {
      throw new AppError(
        `A sheet for date ${data.businessDate}, machine ${data.machineId}, shift ${data.shift} already exists`,
        { statusCode: 409, code: 'DUPLICATE_SHEET' }
      );
    }

    // Fetch nozzles for machine
    const nozzles = await NozzleModel.find({
      stationId: req.stationId,
      machineId: data.machineId,
      isActive: true,
    }).sort({ position: 1 });

    if (nozzles.length === 0) {
      throw new AppError('No nozzles found configured for this machine', { statusCode: 400 });
    }

    // Auto-fill nozzle readings with lastClosingReadingMilli
    const targetDate = new Date(data.businessDate);
    const nozzleReadings = nozzles.map((n) => ({
      nozzleId: n._id,
      productId: n.productId,
      openingMilli: n.lastClosingReadingMilli,
      closingMilli: n.lastClosingReadingMilli, // default closing = opening (0 litres)
      testingLitresCenti: 0,
      isMeterReset: false,
      litresCenti: 0,
    }));

    // Snapshot current product rates for the date
    const productIds = Array.from(new Set(nozzles.map((n) => n.productId.toString())));
    const productTotals = await Promise.all(
      productIds.map(async (pId) => {
        const prod = await ProductModel.findById(pId);
        const latestRate = await RateHistoryModel.findOne({
          stationId: req.stationId,
          productId: pId,
          effectiveFrom: { $lte: targetDate },
        }).sort({ effectiveFrom: -1 });

        const ratePaise = latestRate ? latestRate.ratePaise : prod?.currentRatePaise || 0;
        return {
          productId: new mongoose.Types.ObjectId(pId),
          litresCenti: 0,
          ratePaise,
          amountPaise: 0,
        };
      })
    );

    const sheet = await DailySheetModel.create({
      stationId: req.stationId,
      businessDate: data.businessDate,
      shift: data.shift,
      machineId: data.machineId,
      staffId: data.staffId,
      status: SheetStatus.DRAFT,
      nozzleReadings,
      productTotals,
      totalAmountPaise: 0,
      payments: [],
      cashTotalPaise: 0,
      onlineTotalPaise: 0,
      cardTotalPaise: 0,
      creditTotalPaise: 0,
      totalCollectedPaise: 0,
      shortExcessPaise: 0,
      closedAtTime: data.closedAtTime,
      remarks: data.remarks,
    });

    res.status(201).json({ sheet });
  } catch (error) {
    next(error);
  }
});

// Get single sheet by ID
sheetRouter.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sheet = await DailySheetModel.findOne({ _id: req.params.id, stationId: req.stationId })
      .populate('machineId', 'number name')
      .populate('staffId', 'name code')
      .populate('nozzleReadings.productId', 'name shortCode unit')
      .populate('productTotals.productId', 'name shortCode unit')
      .populate('payments.creditCustomerId', 'name phone');

    if (!sheet) {
      throw new AppError('Daily sheet not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    res.json({ sheet });
  } catch (error) {
    next(error);
  }
});

// Update draft sheet readings and payments
sheetRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sheet = await DailySheetModel.findOne({ _id: req.params.id, stationId: req.stationId });
    if (!sheet) {
      throw new AppError('Daily sheet not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    if (sheet.status !== SheetStatus.DRAFT && req.user?.role === Role.ATTENDANT) {
      throw new AppError('Only draft sheets can be edited by attendants', {
        statusCode: 403,
        code: 'SHEET_NOT_DRAFT',
      });
    }

    const updates = UpdateDailySheetSchema.parse(req.body);
    const station = await StationModel.findById(req.stationId);
    const roundingMode = station?.settings?.roundingMode || RoundingMode.TRUNCATE;

    if (updates.staffId) sheet.staffId = new mongoose.Types.ObjectId(updates.staffId);
    if (updates.closedAtTime !== undefined) sheet.closedAtTime = updates.closedAtTime;
    if (updates.remarks !== undefined) sheet.remarks = updates.remarks;

    if (updates.nozzleReadings || updates.payments) {
      const nozzleInputs = (updates.nozzleReadings || sheet.nozzleReadings).map((n) => ({
        nozzleId: n.nozzleId.toString(),
        productId: n.productId.toString(),
        openingReading: fromMilliUnits(n.openingMilli),
        closingReading: fromMilliUnits(n.closingMilli),
        testingLitres: fromCentiLitres(n.testingLitresCenti),
        isMeterReset: n.isMeterReset,
        resetLitres: n.resetLitresCenti ? fromCentiLitres(n.resetLitresCenti) : undefined,
      }));

      // Map rates from snapshotted product totals
      const rates = sheet.productTotals.map((pt) => ({
        productId: pt.productId.toString(),
        ratePaise: pt.ratePaise,
      }));

      const paymentInputs = (updates.payments || sheet.payments).map((p) => ({
        mode: p.mode,
        amountPaise: p.amountPaise,
        reference: p.reference,
        creditCustomerId: p.creditCustomerId?.toString(),
        time: p.time,
        note: p.note,
      }));

      // Re-run shared calculation engine
      const calcResult = calculateSheet({
        nozzles: nozzleInputs,
        rates,
        payments: paymentInputs,
        roundingMode,
      });

      // Update nozzleReadings with computed litres
      sheet.nozzleReadings = (updates.nozzleReadings || sheet.nozzleReadings).map((n, idx) => {
        const nr = calcResult.nozzleResults[idx];
        return {
          nozzleId: new mongoose.Types.ObjectId(n.nozzleId),
          productId: new mongoose.Types.ObjectId(n.productId),
          openingMilli: n.openingMilli,
          closingMilli: n.closingMilli,
          testingLitresCenti: n.testingLitresCenti,
          isMeterReset: n.isMeterReset,
          resetNote: n.resetNote,
          resetLitresCenti: n.resetLitresCenti,
          litresCenti: nr.litresCenti,
        };
      });

      // Update productTotals
      sheet.productTotals = calcResult.productTotals.map((pt) => ({
        productId: new mongoose.Types.ObjectId(pt.productId),
        litresCenti: pt.litresCenti,
        ratePaise: pt.ratePaise,
        amountPaise: pt.amountPaise,
      }));

      // Update payments and collections
      sheet.payments = paymentInputs.map((p) => ({
        mode: p.mode,
        amountPaise: p.amountPaise,
        reference: p.reference,
        creditCustomerId: p.creditCustomerId ? new mongoose.Types.ObjectId(p.creditCustomerId) : undefined,
        time: p.time,
        note: p.note,
      }));

      sheet.totalAmountPaise = calcResult.totalAmountPaise;
      sheet.cashTotalPaise = calcResult.collections.cashPaise;
      sheet.onlineTotalPaise = calcResult.collections.onlinePaise;
      sheet.cardTotalPaise = calcResult.collections.cardPaise;
      sheet.creditTotalPaise = calcResult.collections.creditPaise;
      sheet.totalCollectedPaise = calcResult.collections.totalCollectedPaise;
      sheet.shortExcessPaise = calcResult.shortExcessPaise;
    }

    await sheet.save();
    res.json({ sheet });
  } catch (error) {
    next(error);
  }
});

// Submit sheet - updates nozzle lastClosingReading and posts credit ledger entries in transaction
sheetRouter.post('/:id/submit', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const sheet = await DailySheetModel.findOne({ _id: req.params.id, stationId: req.stationId }).session(session);
    if (!sheet) {
      throw new AppError('Daily sheet not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    if (sheet.status !== SheetStatus.DRAFT) {
      throw new AppError(`Sheet is already in ${sheet.status} state`, { statusCode: 400 });
    }

    // 1. Update each nozzle's lastClosingReadingMilli to this sheet's closing
    for (const nr of sheet.nozzleReadings) {
      await NozzleModel.findByIdAndUpdate(
        nr.nozzleId,
        { $set: { lastClosingReadingMilli: nr.closingMilli } },
        { session }
      );
    }

    // 2. Post credit ledger SALE entries for CREDIT payments
    const creditPayments = sheet.payments.filter((p) => p.mode === 'CREDIT' && p.creditCustomerId);
    for (const cp of creditPayments) {
      await CreditLedgerEntryModel.create(
        [
          {
            stationId: req.stationId,
            creditCustomerId: cp.creditCustomerId,
            date: new Date(sheet.businessDate),
            type: CreditLedgerType.SALE,
            amountPaise: cp.amountPaise,
            sheetId: sheet._id,
            note: cp.note || `Sale from sheet ${sheet.businessDate}`,
          },
        ],
        { session }
      );

      // Increase customer current balance
      await CreditCustomerModel.findByIdAndUpdate(
        cp.creditCustomerId,
        { $inc: { currentBalancePaise: cp.amountPaise } },
        { session }
      );
    }

    // 3. Mark sheet as SUBMITTED
    sheet.status = SheetStatus.SUBMITTED;
    sheet.submittedBy = new mongoose.Types.ObjectId(req.user!.userId);
    sheet.submittedAt = new Date();
    await sheet.save({ session });

    // 4. Record audit log
    await AuditLogModel.create(
      [
        {
          stationId: req.stationId,
          entity: 'DailySheet',
          entityId: sheet._id.toString(),
          action: AuditAction.SUBMIT,
          userId: req.user!.userId,
          after: sheet.toObject(),
        },
      ],
      { session }
    );

    await session.commitTransaction();
    res.json({ sheet, message: 'Sheet submitted successfully' });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});

// Approve sheet - OWNER & MANAGER
sheetRouter.post('/:id/approve', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sheet = await DailySheetModel.findOne({ _id: req.params.id, stationId: req.stationId });
    if (!sheet) {
      throw new AppError('Daily sheet not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    sheet.status = SheetStatus.APPROVED;
    sheet.approvedBy = new mongoose.Types.ObjectId(req.user!.userId);
    sheet.approvedAt = new Date();
    await sheet.save();

    await AuditLogModel.create({
      stationId: req.stationId,
      entity: 'DailySheet',
      entityId: sheet._id.toString(),
      action: AuditAction.APPROVE,
      userId: req.user!.userId,
    });

    res.json({ sheet, message: 'Sheet approved successfully' });
  } catch (error) {
    next(error);
  }
});

// Reopen sheet - OWNER & MANAGER (audited)
sheetRouter.post('/:id/reopen', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sheet = await DailySheetModel.findOne({ _id: req.params.id, stationId: req.stationId });
    if (!sheet) {
      throw new AppError('Daily sheet not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    const previousStatus = sheet.status;
    sheet.status = SheetStatus.DRAFT;
    await sheet.save();

    await AuditLogModel.create({
      stationId: req.stationId,
      entity: 'DailySheet',
      entityId: sheet._id.toString(),
      action: AuditAction.REOPEN,
      userId: req.user!.userId,
      reason: req.body?.reason || `Reopened from ${previousStatus}`,
    });

    res.json({ sheet, message: 'Sheet reopened to DRAFT state' });
  } catch (error) {
    next(error);
  }
});

