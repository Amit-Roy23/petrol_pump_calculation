import { Request, Response, NextFunction } from 'express';
import { Role } from '@petrolpump/shared';
import { verifyAccessToken, TokenPayload } from '../utils/jwt.js';
import { AppError } from './errorHandler.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
      stationId?: string;
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    next(new AppError('Authentication required', { statusCode: 401, code: 'UNAUTHORIZED' }));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    req.stationId = payload.stationId;
    next();
  } catch (error) {
    next(new AppError('Invalid or expired access token', { statusCode: 401, code: 'INVALID_TOKEN' }));
  }
}

export function requireRole(allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('Authentication required', { statusCode: 401, code: 'UNAUTHORIZED' }));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(
        new AppError('You do not have permission to perform this action', {
          statusCode: 403,
          code: 'FORBIDDEN',
        })
      );
      return;
    }

    next();
  };
}

