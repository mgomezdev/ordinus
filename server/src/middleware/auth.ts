import jwt from 'jsonwebtoken';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import { config } from '../config.js';
import type { Request, Response, NextFunction } from 'express';

interface JwtPayload {
  userId: number;
  role: string;
  iat: number;
  exp: number;
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = extractToken(req);

  if (!token) {
    next(new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required'));
    return;
  }

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    req.user = { userId: payload.userId, role: payload.role };
    next();
  } catch {
    next(new AppError(ErrorCodes.AUTH_REQUIRED, 'Invalid or expired token'));
  }
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = extractToken(req);

  if (!token) {
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    req.user = { userId: payload.userId, role: payload.role };
  } catch {
    // Invalid token, but optional — continue without user
  }

  next();
}
