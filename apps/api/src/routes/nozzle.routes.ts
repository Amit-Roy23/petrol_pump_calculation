import { Router, Request, Response, NextFunction } from 'express';
import { Role, CreateNozzleSchema, UpdateNozzleSchema } from '@petrolpump/shared';
import { NozzleModel } from '../models/Nozzle.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const nozzleRouter = Router();

nozzleRouter.use(authenticateToken);

nozzleRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filter: Record<string, unknown> = { stationId: req.stationId };
    if (req.query.machineId) {
      filter.machineId = req.query.machineId;
    }

    const nozzles = await NozzleModel.find(filter)
      .populate('productId', 'name shortCode unit currentRatePaise')
      .populate('machineId', 'number name')
      .sort({ machineId: 1, position: 1 });

    res.json({ nozzles });
  } catch (error) {
    next(error);
  }
});

nozzleRouter.post('/', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = CreateNozzleSchema.parse(req.body);

    const existing = await NozzleModel.findOne({
      machineId: data.machineId,
      position: data.position,
    });
    if (existing) {
      throw new AppError(`Position ${data.position} already configured for this machine`, {
        statusCode: 409,
        code: 'DUPLICATE_NOZZLE_POSITION',
      });
    }

    const nozzle = await NozzleModel.create({
      stationId: req.stationId,
      machineId: data.machineId,
      position: data.position,
      productId: data.productId,
      lastClosingReadingMilli: data.initialReadingMilli,
      meterMaxReadingMilli: data.meterMaxReadingMilli,
      isActive: data.isActive,
    });

    res.status(201).json({ nozzle });
  } catch (error) {
    next(error);
  }
});

nozzleRouter.patch('/:id', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = UpdateNozzleSchema.parse(req.body);
    const nozzle = await NozzleModel.findOneAndUpdate(
      { _id: req.params.id, stationId: req.stationId },
      { $set: data },
      { new: true }
    );

    if (!nozzle) {
      throw new AppError('Nozzle not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    res.json({ nozzle });
  } catch (error) {
    next(error);
  }
});

