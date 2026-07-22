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
    const customerIdStr = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const customerId = customerIdStr ? parseInt(customerIdStr, 10) : undefined;

    const images = await refImageService.listRefImages(customerId);

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
    const file = req.file;
    if (!file) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'No image file provided');
    }

    const image = await refImageService.uploadRefImage(
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
    const imageId = parseInt(req.params.id as string, 10);
    if (isNaN(imageId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid image ID');
    }

    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const image = await refImageService.renameRefImage(imageId, parsed.data.name);

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
    const imageId = parseInt(req.params.id as string, 10);
    if (isNaN(imageId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid image ID');
    }

    await refImageService.deleteRefImage(imageId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
