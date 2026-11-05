import type { Request } from 'express';
import { AppError, ErrorCodes } from '@gridfinity/shared';

/** Parses an integer route param, throwing a 400 `Invalid <label>` when it isn't one. */
export function parseIntParam(req: Request, name: string, label: string = name): number {
  const value = parseInt(req.params[name] as string, 10);
  if (isNaN(value)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, `Invalid ${label}`);
  }
  return value;
}
