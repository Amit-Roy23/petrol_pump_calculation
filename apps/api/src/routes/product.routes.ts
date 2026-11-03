import { Router, Request, Response, NextFunction } from 'express';
import { Role, CreateProductSchema, UpdateProductSchema } from '@petrolpump/shared';
import { ProductModel } from '../models/Product.js';
import { RateHistoryModel } from '../models/RateHistory.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const productRouter = Router();

productRouter.use(authenticateToken);

productRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const products = await ProductModel.find({ stationId: req.stationId }).sort({ name: 1 });
    res.json({ products });
  } catch (error) {
    next(error);
  }
});

productRouter.post('/', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = CreateProductSchema.parse(req.body);

    const existing = await ProductModel.findOne({ stationId: req.stationId, shortCode: data.shortCode });
    if (existing) {
      throw new AppError(`Product short code '${data.shortCode}' already exists`, {
        statusCode: 409,
        code: 'DUPLICATE_SHORT_CODE',
      });
    }

    const product = await ProductModel.create({
      stationId: req.stationId,
      name: data.name,
      shortCode: data.shortCode,
      unit: data.unit,
      colourTag: data.colourTag,
      currentRatePaise: data.initialRatePaise,
      isActive: data.isActive,
    });

    // Create initial rate history
    await RateHistoryModel.create({
      stationId: req.stationId,
      productId: product._id,
      ratePaise: data.initialRatePaise,
      effectiveFrom: new Date(),
      setBy: req.user!.userId,
    });

    res.status(201).json({ product });
  } catch (error) {
    next(error);
  }
});

productRouter.patch('/:id', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = UpdateProductSchema.parse(req.body);
    const product = await ProductModel.findOneAndUpdate(
      { _id: req.params.id, stationId: req.stationId },
      { $set: data },
      { new: true }
    );

    if (!product) {
      throw new AppError('Product not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    res.json({ product });
  } catch (error) {
    next(error);
  }
});

