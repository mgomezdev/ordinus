import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';

export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user || req.user.role !== 'admin') {
    next(new AppError(ErrorCodes.FORBIDDEN, 'Admin access required'));
    return;
  }
  next();
}
