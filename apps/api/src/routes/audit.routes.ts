import { Router, Request, Response, NextFunction } from 'express';
import { Role } from '@petrolpump/shared';
import { AuditLogModel } from '../models/AuditLog.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const auditRouter = Router();

auditRouter.use(authenticateToken);
auditRouter.use(requireRole([Role.OWNER, Role.MANAGER]));

auditRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filter: Record<string, unknown> = { stationId: req.stationId };
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.entityId) filter.entityId = req.query.entityId;

    const logs = await AuditLogModel.find(filter)
      .populate('userId', 'name role')
      .sort({ timestamp: -1 })
      .limit(100);

    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

