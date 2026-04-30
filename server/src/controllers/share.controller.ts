import { z } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiResponse, ApiSharedProject, ApiSharedLayoutView } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import * as shareService from '../services/share.service.js';

const createShareSchema = z.object({
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export async function createShare(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const layoutId = parseInt(req.params.id as string, 10);
    if (isNaN(layoutId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
    }

    const parsed = createShareSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const share = await shareService.createShare(
      layoutId,
      req.user.userId,
      parsed.data.expiresInDays,
    );

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
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const shareId = parseInt(req.params.shareId as string, 10);
    if (isNaN(shareId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid share ID');
    }

    await shareService.deleteShare(shareId, req.user.userId);
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
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const layoutId = parseInt(req.params.id as string, 10);
    if (isNaN(layoutId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
    }

    const shares = await shareService.getSharesByLayout(layoutId, req.user.userId);

    const body: ApiResponse<ApiSharedProject[]> = { data: shares };
    res.json(body);
  } catch (err) {
    next(err);
  }
}
