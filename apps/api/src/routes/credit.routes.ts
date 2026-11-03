import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import {
  Role,
  CreateCreditCustomerSchema,
  UpdateCreditCustomerSchema,
  CreateCreditReceiptSchema,
  CreditLedgerType,
} from '@petrolpump/shared';
import { CreditCustomerModel } from '../models/CreditCustomer.js';
import { CreditLedgerEntryModel } from '../models/CreditLedgerEntry.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const creditRouter = Router();

creditRouter.use(authenticateToken);

// List credit customers
creditRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customers = await CreditCustomerModel.find({ stationId: req.stationId }).sort({ name: 1 });
    res.json({ customers });
  } catch (error) {
    next(error);
  }
});

// Create credit customer
creditRouter.post('/', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = CreateCreditCustomerSchema.parse(req.body);

    const customer = await CreditCustomerModel.create({
      ...data,
      stationId: req.stationId,
      currentBalancePaise: data.openingBalancePaise,
    });

    res.status(201).json({ customer });
  } catch (error) {
    next(error);
  }
});

// Update credit customer
creditRouter.patch('/:id', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = UpdateCreditCustomerSchema.parse(req.body);
    const customer = await CreditCustomerModel.findOneAndUpdate(
      { _id: req.params.id, stationId: req.stationId },
      { $set: data },
      { new: true }
    );

    if (!customer) {
      throw new AppError('Credit customer not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    res.json({ customer });
  } catch (error) {
    next(error);
  }
});

// Get customer ledger
creditRouter.get('/:id/ledger', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customer = await CreditCustomerModel.findOne({ _id: req.params.id, stationId: req.stationId });
    if (!customer) {
      throw new AppError('Customer not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    const filter: Record<string, unknown> = {
      stationId: req.stationId,
      creditCustomerId: customer._id,
    };

    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) {
        (filter.date as Record<string, unknown>).$gte = new Date(req.query.from as string);
      }
      if (req.query.to) {
        (filter.date as Record<string, unknown>).$lte = new Date(req.query.to as string);
      }
    }

    const entries = await CreditLedgerEntryModel.find(filter).sort({ date: -1, createdAt: -1 });

    res.json({ customer, entries });
  } catch (error) {
    next(error);
  }
});

// Post customer receipt (payment received)
creditRouter.post('/:id/receipts', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const data = CreateCreditReceiptSchema.parse({
      ...req.body,
      creditCustomerId: req.params.id,
    });

    const customer = await CreditCustomerModel.findOne({
      _id: req.params.id,
      stationId: req.stationId,
    }).session(session);

    if (!customer) {
      throw new AppError('Credit customer not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    const receipt = await CreditLedgerEntryModel.create(
      [
        {
          stationId: req.stationId,
          creditCustomerId: customer._id,
          date: data.date,
          type: CreditLedgerType.RECEIPT,
          amountPaise: data.amountPaise,
          paymentMode: data.paymentMode,
          note: data.note,
        },
      ],
      { session }
    );

    // Deduct receipt amount from customer current balance
    customer.currentBalancePaise -= data.amountPaise;
    await customer.save({ session });

    await session.commitTransaction();
    res.status(201).json({ receipt: receipt[0], currentBalancePaise: customer.currentBalancePaise });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});

