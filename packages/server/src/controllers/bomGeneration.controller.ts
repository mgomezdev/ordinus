import { createReadStream, existsSync } from 'fs';
import path from 'path';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiResponse, ApiBomGeneration } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import * as bomGenerationService from '../services/bomGeneration.service.js';
import { config } from '../config.js';

function parseSubmissionId(req: Request): number {
  const id = parseInt(req.params.submissionId as string, 10);
  if (isNaN(id)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid submission ID');
  return id;
}

export async function generateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const submissionId = parseSubmissionId(req);
    const generation = await bomGenerationService.triggerGeneration(submissionId);
    const body: ApiResponse<ApiBomGeneration> = { data: generation };
    res.status(202).json(body);
  } catch (err) {
    next(err);
  }
}

export async function getGenerationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const submissionId = parseSubmissionId(req);
    const generation = await bomGenerationService.getGeneration(submissionId);
    if (!generation) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'No generation record for this submission');
    }
    const body: ApiResponse<ApiBomGeneration> = { data: generation };
    res.status(200).json(body);
  } catch (err) {
    next(err);
  }
}

export function serveFileHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const submissionId = parseSubmissionId(req);
    const filename = req.params.filename as string;

    // Prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid filename');
    }

    const filePath = path.resolve(config.GENERATED_STL_DIR, `bom-${submissionId}`, filename);
    if (!existsSync(filePath)) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'File not found');
    }

    const contentType = filename.endsWith('.3mf')
      ? 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'
      : 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}
