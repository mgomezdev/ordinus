import path from 'node:path';
import fs from 'node:fs/promises';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { layouts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';

const router = Router();

router.get('/:layoutId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const layoutId = parseInt(req.params.layoutId as string, 10);
    if (isNaN(layoutId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
    }

    const [layout] = await db.select({ thumbnailPath: layouts.thumbnailPath })
      .from(layouts)
      .where(eq(layouts.id, layoutId))
      .limit(1);

    if (!layout) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
    }

    if (!layout.thumbnailPath) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'No thumbnail for this layout');
    }

    // Path traversal guard: filename must not contain directory separators
    if (path.basename(layout.thumbnailPath) !== layout.thumbnailPath) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid path');
    }

    const filePath = path.join(config.THUMBNAIL_DIR, layout.thumbnailPath);

    try {
      await fs.access(filePath);
    } catch {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Thumbnail file not found');
    }

    res.setHeader('Content-Type', 'image/svg+xml');
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

export default router;
