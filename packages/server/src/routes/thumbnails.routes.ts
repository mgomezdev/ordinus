import { Router } from 'express';
import path, { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../db/connection.js';
import { layouts } from '../db/schema.js';
import { config } from '../config.js';

const router = Router();

router.get('/:layoutId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const layoutId = parseInt(req.params.layoutId as string, 10);
    if (isNaN(layoutId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
    }

    const rows = await db
      .select({ userId: layouts.userId, thumbnailPath: layouts.thumbnailPath })
      .from(layouts)
      .where(eq(layouts.id, layoutId))
      .limit(1);

    if (rows.length === 0) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
    }

    const layout = rows[0];
    const isAdmin = req.user!.role === 'admin';

    if (layout.userId !== req.user!.userId && !isAdmin) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied');
    }

    if (!layout.thumbnailPath) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Thumbnail not found');
    }

    // Prevent path traversal — thumbnails are always flat filenames like "42.svg"
    if (!layout.thumbnailPath || path.basename(layout.thumbnailPath) !== layout.thumbnailPath) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid path');
    }
    const dir = resolve(config.THUMBNAIL_DIR);
    const filePath = resolve(dir, layout.thumbnailPath);

    if (!existsSync(filePath)) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Thumbnail not found');
    }

    res.setHeader('Content-Type', 'image/svg+xml');
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

export default router;
