import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(
        new AppError(
          ErrorCodes.VALIDATION_ERROR,
          'Invalid query parameters',
          result.error.flatten().fieldErrors,
        ),
      );
      return;
    }
    req.query = result.data;
    next();
  };
}

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        new AppError(
          ErrorCodes.VALIDATION_ERROR,
          'Invalid request body',
          result.error.flatten().fieldErrors,
        ),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}
