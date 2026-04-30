import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiResponse, ApiReferenceImage } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import * as referenceImageService from '../services/referenceImage.service.js';

export async function uploadReferenceImage(
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

    const file = req.file;
    if (!file) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'No image file provided');
    }

    const image = await referenceImageService.uploadReferenceImage(
      layoutId,
      req.user.userId,
      { buffer: file.buffer, originalname: file.originalname },
    );

    const body: ApiResponse<ApiReferenceImage> = { data: image };
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
}

export async function deleteReferenceImage(
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

    const imageId = parseInt(req.params.imgId as string, 10);
    if (isNaN(imageId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid image ID');
    }

    await referenceImageService.deleteReferenceImage(
      layoutId,
      imageId,
      req.user.userId,
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
