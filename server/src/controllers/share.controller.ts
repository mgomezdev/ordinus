import { z } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiResponse, ApiSharedProject, ApiSharedLayoutView } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import * as shareService from '../services/share.service.js';
import { parseIntParam } from '../utils/params.js';

const createShareSchema = z.object({
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export async function createShare(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const layoutId = parseIntParam(req, 'id', 'layout ID');

    const parsed = createShareSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const share = await shareService.createShare(layoutId, parsed.data.expiresInDays);

    const body: ApiResponse<ApiSharedProject> = { data: share };
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
}

export async function getSharedLayout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const slug = req.params.slug as string;
    if (!slug) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid slug');
    }

    const sharedLayout = await shareService.getSharedLayout(slug);

    const body: ApiResponse<ApiSharedLayoutView> = { data: sharedLayout };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function deleteShare(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const shareId = parseIntParam(req, 'shareId', 'share ID');

    await shareService.deleteShare(shareId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listSharesByLayout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const layoutId = parseIntParam(req, 'id', 'layout ID');

    const shares = await shareService.getSharesByLayout(layoutId);

    const body: ApiResponse<ApiSharedProject[]> = { data: shares };
    res.json(body);
  } catch (err) {
    next(err);
  }
}
