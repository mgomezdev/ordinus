import { createReadStream, existsSync } from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiResponse, ApiBomGeneration, BOMItem } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/connection.js';
import { layouts } from '../db/schema.js';
import * as bomGenerationService from '../services/bomGeneration.service.js';
import { config } from '../config.js';

function parseLayoutId(req: Request): number {
  const id = parseInt(req.params.layoutId as string, 10);
  if (isNaN(id)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
  return id;
}

async function assertLayoutOwnership(layoutId: number, userId: number): Promise<void> {
  const rows = await db.select({ userId: layouts.userId }).from(layouts).where(eq(layouts.id, layoutId)).limit(1);
  if (!rows.length) throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  if (rows[0].userId !== userId) throw new AppError(ErrorCodes.FORBIDDEN, 'Not authorized');
}

export async function generateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const layoutId = parseLayoutId(req);
    if (!req.user) throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    await assertLayoutOwnership(layoutId, req.user.userId);
    const bomItems = (req.body as { bomItems?: BOMItem[] }).bomItems ?? [];
    const generation = await bomGenerationService.triggerGeneration(layoutId, bomItems);
    const body: ApiResponse<ApiBomGeneration> = { data: generation };
    res.status(202).json(body);
  } catch (err) {
    next(err);
  }
}

export async function getGenerationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const layoutId = parseLayoutId(req);
    if (!req.user) throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    await assertLayoutOwnership(layoutId, req.user.userId);
    const generation = await bomGenerationService.getGeneration(layoutId);
    if (!generation) throw new AppError(ErrorCodes.NOT_FOUND, 'No generation record for this layout');
    const body: ApiResponse<ApiBomGeneration> = { data: generation };
    res.status(200).json(body);
  } catch (err) {
    next(err);
  }
}

export async function serveFileHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const layoutId = parseLayoutId(req);
    if (!req.user) throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    await assertLayoutOwnership(layoutId, req.user.userId);
    const filename = req.params.filename as string;

    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid filename');
    }

    const filePath = path.resolve(config.GENERATED_STL_DIR, `bom-layout-${layoutId}`, filename);
    const baseDir = path.resolve(config.GENERATED_STL_DIR);
    if (!filePath.startsWith(baseDir + path.sep)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid filename');
    }

    if (!existsSync(filePath)) throw new AppError(ErrorCodes.NOT_FOUND, 'File not found');

    const contentType = filename.endsWith('.3mf')
      ? 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'
      : filename.endsWith('.stl')
        ? 'model/stl'
        : 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stream = createReadStream(filePath);
    stream.on('error', (err) => { next(err); });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}
