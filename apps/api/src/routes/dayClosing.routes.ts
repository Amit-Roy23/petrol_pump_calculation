import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import {
  Role,
  DayClosingStatus,
  SheetStatus,
  AuditAction,
  UpdateDayClosingSchema,
  calculateDayClosing,
} from '@petrolpump/shared';
import { DayClosingModel } from '../models/DayClosing.js';
import { DailySheetModel } from '../models/DailySheet.js';
import { AuditLogModel } from '../models/AuditLog.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const dayClosingRouter = Router();

dayClosingRouter.use(authenticateToken);

// Get or auto-initialize day closing for a business date
dayClosingRouter.get('/:date', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const businessDate = req.params.date;

    let dayClosing = await DayClosingModel.findOne({
      stationId: req.stationId,
      businessDate,
    }).populate('sheetIds', 'machineId staffId totalAmountPaise totalCollectedPaise status shortExcessPaise');

    // Find all sheets for that day
    const sheets = await DailySheetModel.find({
      stationId: req.stationId,
      businessDate,
    });

    // Aggregate totals from sheets
    let totalCash = 0;
    let totalOnline = 0;
    let totalCard = 0;
    let totalCredit = 0;
    let totalCollected = 0;

    const productMap = new Map<string, { litresCenti: number; amountPaise: number }>();

    for (const s of sheets) {
      totalCash += s.cashTotalPaise;
      totalOnline += s.onlineTotalPaise;
      totalCard += s.cardTotalPaise;
      totalCredit += s.creditTotalPaise;
      totalCollected += s.totalCollectedPaise;

      for (const pt of s.productTotals) {
        const key = pt.productId.toString();
        const current = productMap.get(key) || { litresCenti: 0, amountPaise: 0 };
        current.litresCenti += pt.litresCenti;
        current.amountPaise += pt.amountPaise;
        productMap.set(key, current);
      }
    }

    const aggregatedProductTotals = Array.from(productMap.entries()).map(([productId, val]) => ({
      productId: new mongoose.Types.ObjectId(productId),
      litresCenti: val.litresCenti,
      amountPaise: val.amountPaise,
    }));

    if (!dayClosing) {
      // Auto-populate default cash handovers from sheets
      const defaultHandovers = sheets.map((s) => ({
        label: `Sheet ${s.machineId}`,
        staffId: s.staffId,
        amountPaise: s.cashTotalPaise,
      }));

      dayClosing = await DayClosingModel.create({
        stationId: req.stationId,
        businessDate,
        sheetIds: sheets.map((s) => s._id),
        productTotals: aggregatedProductTotals,
        cashTotalPaise: totalCash,
        onlineTotalPaise: totalOnline,
        cardTotalPaise: totalCard,
        creditTotalPaise: totalCredit,
        totalCollectedPaise: totalCollected,
        cashHandovers: defaultHandovers,
        denominations: [],
        denominationTotalPaise: 0,
        cashDifferencePaise: -totalCash,
        status: DayClosingStatus.OPEN,
      });
    }

    res.json({ dayClosing, sheetsCount: sheets.length });
  } catch (error) {
    next(error);
  }
});

// Update day closing denominations, extra handovers, and recalculate difference
dayClosingRouter.put('/:date', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const businessDate = req.params.date;
    const data = UpdateDayClosingSchema.parse(req.body);

    const dayClosing = await DayClosingModel.findOne({
      stationId: req.stationId,
      businessDate,
    });

    if (!dayClosing) {
      throw new AppError('Day closing record not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    if (dayClosing.status === DayClosingStatus.CLOSED && req.user?.role !== Role.OWNER) {
      throw new AppError('Only the OWNER can modify a CLOSED day closing record', {
        statusCode: 403,
        code: 'DAY_CLOSED',
      });
    }

    if (data.cashHandovers !== undefined) {
      dayClosing.cashHandovers = data.cashHandovers.map((h) => ({
        label: h.label,
        staffId: h.staffId ? new mongoose.Types.ObjectId(h.staffId) : undefined,
        amountPaise: h.amountPaise,
      }));
    }

    if (data.denominations !== undefined) {
      dayClosing.denominations = data.denominations;
    }

    if (data.remarks !== undefined) {
      dayClosing.remarks = data.remarks;
    }

    // Recalculate using shared calculation engine
    const calcResult = calculateDayClosing({
      sheetCashTotalPaise: dayClosing.cashTotalPaise,
      sheetOnlineTotalPaise: dayClosing.onlineTotalPaise,
      additionalCashHandovers: (dayClosing.cashHandovers || []).map((h) => ({
        label: h.label,
        staffId: h.staffId?.toString(),
        amountPaise: h.amountPaise,
      })),
      denominations: (dayClosing.denominations || []).map((d) => ({
        note: d.note as any,
        count: d.count,
      })),
    });

    dayClosing.denominationTotalPaise = calcResult.denominationTotalPaise;
    dayClosing.cashDifferencePaise = calcResult.cashDifferencePaise;

    await dayClosing.save();
    res.json({ dayClosing, calculation: calcResult });
  } catch (error) {
    next(error);
  }
});

// Close and lock day
dayClosingRouter.post('/:date/close', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const businessDate = req.params.date;

    const dayClosing = await DayClosingModel.findOne({
      stationId: req.stationId,
      businessDate,
    }).session(session);

    if (!dayClosing) {
      throw new AppError('Day closing record not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    dayClosing.status = DayClosingStatus.CLOSED;
    dayClosing.closedBy = new mongoose.Types.ObjectId(req.user!.userId);
    dayClosing.closedAt = new Date();
    await dayClosing.save({ session });

    // Lock all daily sheets for this date
    await DailySheetModel.updateMany(
      { stationId: req.stationId, businessDate },
      { $set: { status: SheetStatus.LOCKED } },
      { session }
    );

    await AuditLogModel.create(
      [
        {
          stationId: req.stationId,
          entity: 'DayClosing',
          entityId: dayClosing._id.toString(),
          action: AuditAction.LOCK,
          userId: req.user!.userId,
          reason: `Day closed with cash difference: ₹${(dayClosing.cashDifferencePaise / 100).toFixed(2)}`,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    res.json({ dayClosing, message: 'Day closed and sheets locked successfully' });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});

