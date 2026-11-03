import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { LoginSchema, PinLoginSchema, RefreshTokenSchema } from '@petrolpump/shared';
import { UserModel } from '../models/User.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { AppError } from '../middleware/errorHandler.js';
import { authenticateToken } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

export const authRouter = Router();

authRouter.post('/login', authLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone, password } = LoginSchema.parse(req.body);

    const user = await UserModel.findOne({ phone, isActive: true });
    if (!user) {
      throw new AppError('Invalid phone number or password', { statusCode: 401, code: 'INVALID_CREDENTIALS' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new AppError('Invalid phone number or password', { statusCode: 401, code: 'INVALID_CREDENTIALS' });
    }

    const payload = {
      userId: user._id.toString(),
      stationId: user.stationId.toString(),
      role: user.role,
      name: user.name,
      phone: user.phone,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store hashed refresh token in DB
    user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await user.save();

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        stationId: user.stationId,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/pin-login', authLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone, pin } = PinLoginSchema.parse(req.body);

    const user = await UserModel.findOne({ phone, isActive: true });
    if (!user || !user.pinHash) {
      throw new AppError('Invalid credentials or PIN not configured', {
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
    }

    const isMatch = await user.comparePin(pin);
    if (!isMatch) {
      throw new AppError('Invalid PIN', { statusCode: 401, code: 'INVALID_CREDENTIALS' });
    }

    const payload = {
      userId: user._id.toString(),
      stationId: user.stationId.toString(),
      role: user.role,
      name: user.name,
      phone: user.phone,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await user.save();

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        stationId: user.stationId,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawToken = req.body?.refreshToken || req.cookies?.refreshToken;
    const { refreshToken } = RefreshTokenSchema.parse({ refreshToken: rawToken });

    const payload = verifyRefreshToken(refreshToken);
    const user = await UserModel.findById(payload.userId);

    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new AppError('Invalid refresh token session', { statusCode: 401, code: 'INVALID_REFRESH_TOKEN' });
    }

    const isMatch = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isMatch) {
      throw new AppError('Refresh token was revoked or rotated', { statusCode: 401, code: 'TOKEN_REVOKED' });
    }

    const newPayload = {
      userId: user._id.toString(),
      stationId: user.stationId.toString(),
      role: user.role,
      name: user.name,
      phone: user.phone,
    };

    const newAccessToken = generateAccessToken(newPayload);
    const newRefreshToken = generateRefreshToken(newPayload);

    user.refreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
    await user.save();

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', authenticateToken, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user) {
      await UserModel.findByIdAndUpdate(req.user.userId, { $unset: { refreshTokenHash: 1 } });
    }
    res.clearCookie('refreshToken');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', authenticateToken, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await UserModel.findById(req.user!.userId).select('-passwordHash -pinHash -refreshTokenHash');
    if (!user) {
      throw new AppError('User not found', { statusCode: 404, code: 'NOT_FOUND' });
    }
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

