import { z } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiResponse, ApiRefImage } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import * as refImageService from '../services/refImage.service.js';

const renameSchema = z.object({
  name: z.string().min(1).max(255),
});

export async function listRefImages(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const images = await refImageService.listRefImages(req.user.userId);

    res.json({ data: images });
  } catch (err) {
    next(err);
  }
}

export async function uploadRefImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const file = req.file;
    if (!file) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'No image file provided');
    }

    const image = await refImageService.uploadRefImage(
      req.user.userId,
      { buffer: file.buffer, originalname: file.originalname },
    );

    const body: ApiResponse<ApiRefImage> = { data: image };
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
}

export async function uploadGlobalRefImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const file = req.file;
    if (!file) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'No image file provided');
    }

    const image = await refImageService.uploadGlobalRefImage(
      req.user.userId,
      { buffer: file.buffer, originalname: file.originalname },
    );

    const body: ApiResponse<ApiRefImage> = { data: image };
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
}

export async function renameRefImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const imageId = parseInt(req.params.id as string, 10);
    if (isNaN(imageId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid image ID');
    }

    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const image = await refImageService.renameRefImage(
      imageId,
      req.user.userId,
      req.user.role,
      parsed.data.name,
    );

    const body: ApiResponse<ApiRefImage> = { data: image };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function deleteRefImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const imageId = parseInt(req.params.id as string, 10);
    if (isNaN(imageId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid image ID');
    }

    await refImageService.deleteRefImage(
      imageId,
      req.user.userId,
      req.user.role,
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
