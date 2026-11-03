import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { Role, CreateUserSchema, UpdateUserSchema } from '@petrolpump/shared';
import { UserModel } from '../models/User.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const userRouter = Router();

userRouter.use(authenticateToken);

// List users for station - OWNER & MANAGER
userRouter.get('/', requireRole([Role.OWNER, Role.MANAGER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const users = await UserModel.find({ stationId: req.stationId })
      .select('-passwordHash -pinHash -refreshTokenHash')
      .sort({ createdAt: -1 });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

// Create user - OWNER only
userRouter.post('/', requireRole([Role.OWNER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = CreateUserSchema.parse(req.body);
    const existing = await UserModel.findOne({ phone: data.phone });
    if (existing) {
      throw new AppError('Phone number already registered', { statusCode: 409, code: 'DUPLICATE_PHONE' });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const pinHash = data.pin ? await bcrypt.hash(data.pin, 10) : undefined;

    const user = await UserModel.create({
      stationId: req.stationId,
      name: data.name,
      phone: data.phone,
      email: data.email,
      passwordHash,
      pinHash,
      role: data.role,
      isActive: data.isActive,
    });

    res.status(201).json({
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update user - OWNER only
userRouter.patch('/:id', requireRole([Role.OWNER]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const updates = UpdateUserSchema.parse(req.body);
    const user = await UserModel.findOne({ _id: req.params.id, stationId: req.stationId });
    if (!user) {
      throw new AppError('User not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    if (updates.name) user.name = updates.name;
    if (updates.phone) user.phone = updates.phone;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.role) user.role = updates.role;
    if (updates.isActive !== undefined) user.isActive = updates.isActive;
    if (updates.password) user.passwordHash = await bcrypt.hash(updates.password, 10);
    if (updates.pin) user.pinHash = await bcrypt.hash(updates.pin, 10);

    await user.save();

    res.json({
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    next(error);
  }
});

