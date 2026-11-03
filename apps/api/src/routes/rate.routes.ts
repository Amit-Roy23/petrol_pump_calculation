import { Router, Request, Response, NextFunction } from 'express';
import { Role, SetRateSchema } from '@petrolpump/shared';
import { RateHistoryModel } from '../models/RateHistory.js';
import { ProductModel } from '../models/Product.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const rateRouter = Router();

rateRouter.use(authenticateToken);

// Get current rates for all active products
rateRouter.get('/current', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const products = await ProductModel.find({ stationId: req.stationId, isActive: true });
    const targetDate = req.query.date ? new Date(req.query.date as string) : new Date();

    const rates = await Promise.all(
      products.map(async (prod) => {
        const latestRate = await RateHistoryModel.findOne({
          stationId: req.stationId,
          productId: prod._id,
          effectiveFrom: { $lte: targetDate },
        }).sort({ effectiveFrom: -1 });

        return {
          productId: prod._id,
          productName: prod.name,
          shortCode: prod.shortCode,
          ratePaise: latestRate ? latestRate.ratePaise : prod.currentRatePaise || 0,
          effectiveFrom: latestRate?.effectiveFrom,
        };
      })
    );

    res.json({ rates });
  } catch (error) {
    next(error);
  }
});

// Get rate history for a product
rateRouter.get('/history', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { productId } = req.query;
    if (!productId) {
      throw new AppError('productId query parameter is required', { statusCode: 400 });
    }

    const history = await RateHistoryModel.find({
      stationId: req.stationId,
      productId,
    })
      .sort({ effectiveFrom: -1 })
      .populate('setBy', 'name');

    res.json({ history });
  } catch (error) {
    next(error);
  }
});

// Set new rate - OWNER/MANAGER only
rateRouter.post('/', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = SetRateSchema.parse(req.body);

    const product = await ProductModel.findOne({ _id: data.productId, stationId: req.stationId });
    if (!product) {
      throw new AppError('Product not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    const rateEntry = await RateHistoryModel.create({
      stationId: req.stationId,
      productId: data.productId,
      ratePaise: data.ratePaise,
      effectiveFrom: data.effectiveFrom,
      setBy: req.user!.userId,
    });

    // Update currentRatePaise on product document
    product.currentRatePaise = data.ratePaise;
    await product.save();

    res.status(201).json({ rate: rateEntry });
  } catch (error) {
    next(error);
  }
});

