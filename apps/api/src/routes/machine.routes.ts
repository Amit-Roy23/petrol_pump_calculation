import { Router, Request, Response, NextFunction } from 'express';
import { Role, CreateMachineSchema, UpdateMachineSchema } from '@petrolpump/shared';
import { MachineModel } from '../models/Machine.js';
import { NozzleModel } from '../models/Nozzle.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const machineRouter = Router();

machineRouter.use(authenticateToken);

machineRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const machines = await MachineModel.find({ stationId: req.stationId }).sort({ displayOrder: 1 });

    const machinesWithNozzles = await Promise.all(
      machines.map(async (m) => {
        const nozzles = await NozzleModel.find({ machineId: m._id })
          .populate('productId', 'name shortCode unit currentRatePaise')
          .sort({ position: 1 });
        return {
          ...m.toObject(),
          nozzles,
        };
      })
    );

    res.json({ machines: machinesWithNozzles });
  } catch (error) {
    next(error);
  }
});

machineRouter.post('/', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = CreateMachineSchema.parse(req.body);

    const existing = await MachineModel.findOne({ stationId: req.stationId, number: data.number });
    if (existing) {
      throw new AppError(`Machine number '${data.number}' already exists`, {
        statusCode: 409,
        code: 'DUPLICATE_MACHINE',
      });
    }

    const machine = await MachineModel.create({
      ...data,
      stationId: req.stationId,
    });

    res.status(201).json({ machine });
  } catch (error) {
    next(error);
  }
});

machineRouter.patch('/:id', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = UpdateMachineSchema.parse(req.body);
    const machine = await MachineModel.findOneAndUpdate(
      { _id: req.params.id, stationId: req.stationId },
      { $set: data },
      { new: true }
    );

    if (!machine) {
      throw new AppError('Machine not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    res.json({ machine });
  } catch (error) {
    next(error);
  }
});

