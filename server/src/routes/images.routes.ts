import { Router } from 'express';
import { resolve, normalize } from 'node:path';
import { existsSync } from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import { config } from '../config.js';

const router = Router();

router.get('/:libraryId/:filename', (req: Request, res: Response, next: NextFunction) => {
  try {
    const libraryId = req.params.libraryId as string;
    const filename = req.params.filename as string;

    // Validate path components against traversal attacks
    if (
      libraryId.includes('..') ||
      libraryId.includes('\0') ||
      filename.includes('..') ||
      filename.includes('\0') ||
      libraryId.includes('/') ||
      libraryId.includes('\\') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid path');
    }

    const imageDir = resolve(config.IMAGE_DIR);
    const filePath = resolve(imageDir, libraryId, filename);

    // Ensure resolved path is within image directory
    const normalizedFilePath = normalize(filePath);
    const normalizedImageDir = normalize(imageDir);
    if (!normalizedFilePath.startsWith(normalizedImageDir)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid path');
    }

    if (!existsSync(filePath)) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Image not found');
    }

    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

export default router;
