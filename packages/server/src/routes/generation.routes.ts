import { Router } from 'express';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { normalize } from 'node:path';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { BinCustomization } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../db/connection.js';
import { libraryItems, libraries } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { computeParamHash } from '../utils/generationParams.js';
import { buildGenerateParams } from '../services/bomGeneration.service.js';
import { generationPipeline } from '../services/generationPipeline.service.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const router = Router();

// Fan-out registry: single pair of EventEmitter listeners broadcast to all SSE clients,
// keeping the emitter's listener count at 2 regardless of concurrent connections.
const sseSubscribers = new Set<(data: object) => void>();
generationPipeline.on('generation:complete', (d: { hash: string }) =>
  sseSubscribers.forEach(send => send({ type: 'generation:complete', hash: d.hash })));
generationPipeline.on('generation:failed', (d: { hash: string; error: string }) =>
  sseSubscribers.forEach(send => send({ type: 'generation:failed', hash: d.hash, error: d.error })));

const VALID_IMAGE_FILENAMES = new Set([
  'ortho.png',
  'perspective_0.png',
  'perspective_90.png',
  'perspective_180.png',
  'perspective_270.png',
]);

// POST /generation/generate — enqueue for a library item + optional customization
router.post('/generate', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { libraryId, itemId, customization } = req.body as {
      libraryId?: string;
      itemId?: string;
      customization?: Record<string, unknown>;
    };

    if (!libraryId || !itemId) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'libraryId and itemId are required');
    }

    // Look up item + library (including stored parameters JSON)
    const itemRows = await db
      .select({
        widthUnits: libraryItems.widthUnits,
        heightUnits: libraryItems.heightUnits,
      })
      .from(libraryItems)
      .where(and(eq(libraryItems.libraryId, libraryId), eq(libraryItems.id, itemId)))
      .limit(1);

    if (!itemRows.length) {
      throw new AppError(ErrorCodes.NOT_FOUND, `Item ${libraryId}/${itemId} not found`);
    }

    const libRows = await db
      .select({ baseModelPath: libraries.baseModelPath, parameters: libraries.parameters })
      .from(libraries)
      .where(eq(libraries.id, libraryId))
      .limit(1);

    const baseModelPath = libRows[0]?.baseModelPath;
    if (!baseModelPath) {
      throw new AppError(ErrorCodes.NOT_FOUND, `Library ${libraryId} has no base model`);
    }

    const libraryParameters = libRows[0]?.parameters
      ? (JSON.parse(libRows[0].parameters) as Record<string, unknown>)
      : {};

    const { widthUnits, heightUnits } = itemRows[0];

    const defaultCustomization: BinCustomization = {
      wallPatternEnabled: false, wallPattern: 'grid', lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none', height: 4,
    };

    const params = buildGenerateParams({
      widthUnits,
      heightUnits,
      customization: (customization as BinCustomization | undefined) ?? defaultCustomization,
      qty: 1,
      filename: 'bin.stl',
      baseModelPath,
      parameters: Object.keys(libraryParameters).length > 0 ? libraryParameters : undefined,
    });

    const hash = computeParamHash(params as Record<string, unknown>);
    const status = await generationPipeline.enqueue(hash, params as Record<string, unknown>, baseModelPath);

    res.json({ hash, status });
  } catch (err) {
    next(err);
  }
});

// GET /generation/status/:hash
router.get('/status/:hash', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hash = req.params['hash'] as string;
    if (hash.includes('..') || hash.includes('/') || hash.includes('\\')) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid hash');
    }
    const status = await generationPipeline.getStatus(hash);
    res.json({ hash, status });
  } catch (err) {
    next(err);
  }
});

// GET /generation/image/:hash/:filename — serve image, touch .accessed for custom
router.get('/image/:hash/:filename', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hash = req.params['hash'] as string;
    const filename = req.params['filename'] as string;

    if (
      !VALID_IMAGE_FILENAMES.has(filename) ||
      hash.includes('..') || hash.includes('/') || hash.includes('\\')
    ) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid path');
    }

    const generatedDir = path.resolve(config.GENERATED_STL_DIR);

    for (const subdir of ['library', 'custom'] as const) {
      const dir = path.join(generatedDir, subdir, hash);
      const filePath = path.join(dir, filename);
      const normalizedBase = normalize(path.join(generatedDir, subdir)) + path.sep;
      if (!normalize(filePath).startsWith(normalizedBase)) continue;

      if (existsSync(filePath)) {
        if (subdir === 'custom') {
          const accessedFile = path.join(dir, '.accessed');
          fs.writeFile(accessedFile, '').catch(() => {});
        }
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.sendFile(filePath);
        return;
      }
    }

    throw new AppError(ErrorCodes.NOT_FOUND, 'Image not found');
  } catch (err) {
    next(err);
  }
});

// GET /generation/stl/:hash — serve STL
router.get('/stl/:hash', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hash = req.params['hash'] as string;
    if (hash.includes('..') || hash.includes('/') || hash.includes('\\')) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid hash');
    }

    const generatedDir = path.resolve(config.GENERATED_STL_DIR);
    for (const subdir of ['library', 'custom'] as const) {
      const filePath = path.join(generatedDir, subdir, hash, 'bin.stl');
      const normalizedBase = normalize(path.join(generatedDir, subdir)) + path.sep;
      if (!normalize(filePath).startsWith(normalizedBase)) continue;
      if (existsSync(filePath)) {
        res.sendFile(filePath);
        return;
      }
    }

    throw new AppError(ErrorCodes.NOT_FOUND, 'STL not found');
  } catch (err) {
    next(err);
  }
});

// GET /generation/events — SSE stream
router.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: object) => { res.write(`data: ${JSON.stringify(data)}\n\n`); };

  sseSubscribers.add(send);
  req.on('close', () => { sseSubscribers.delete(send); });

  logger.debug('SSE client connected for generation events');
});

export default router;
