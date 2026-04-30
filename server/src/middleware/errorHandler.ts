import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiErrorResponse } from '@gridfinity/shared';
import { config } from '../config.js';
import { logger } from '../logger.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // Express requires all 4 params to identify error middleware
  _next: NextFunction, // eslint-disable-line @typescript-eslint/no-unused-vars
): void {
  const requestId = req.requestId ?? 'unknown';

  if (err instanceof AppError) {
    logger.warn({ err, requestId }, `AppError: ${err.message}`);

    const body: ApiErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        requestId,
      },
    };

    if (err.details) {
      body.error.details = err.details;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // Unknown error
  logger.error({ err, requestId }, 'Unhandled error');

  const message =
    config.NODE_ENV === 'production'
      ? 'An internal error occurred'
      : err.message;

  const body: ApiErrorResponse = {
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message,
      requestId,
    },
  };

  res.status(500).json(body);
}
