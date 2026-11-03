import { Router, Request, Response, NextFunction } from 'express';
import { Role, CreateStaffSchema, UpdateStaffSchema } from '@petrolpump/shared';
import { StaffModel } from '../models/Staff.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const staffRouter = Router();

staffRouter.use(authenticateToken);

staffRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const staff = await StaffModel.find({ stationId: req.stationId }).sort({ name: 1 });
    res.json({ staff });
  } catch (error) {
    next(error);
  }
});

staffRouter.post('/', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = CreateStaffSchema.parse(req.body);

    const existing = await StaffModel.findOne({ stationId: req.stationId, code: data.code });
    if (existing) {
      throw new AppError(`Staff code '${data.code}' already exists`, { statusCode: 409, code: 'DUPLICATE_CODE' });
    }

    const staff = await StaffModel.create({
      ...data,
      stationId: req.stationId,
    });

    res.status(201).json({ staff });
  } catch (error) {
    next(error);
  }
});

staffRouter.patch('/:id', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = UpdateStaffSchema.parse(req.body);
    const staff = await StaffModel.findOneAndUpdate(
      { _id: req.params.id, stationId: req.stationId },
      { $set: data },
      { new: true }
    );

    if (!staff) {
      throw new AppError('Staff member not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    res.json({ staff });
  } catch (error) {
    next(error);
  }
});

