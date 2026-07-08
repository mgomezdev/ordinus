import { z } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiResponse, ApiListResponse, ApiLayout, ApiLayoutDetail } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import * as layoutService from '../services/layout.service.js';

const binCustomizationSchema = z.preprocess(
  (raw) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const d = raw as Record<string, unknown>;
    // backward compat: wallPattern 'none' means wall pattern disabled
    if (d['wallPattern'] === 'none') {
      return { ...d, wallPatternEnabled: false, wallPattern: 'grid' };
    }
    if (d['wallPatternEnabled'] === undefined) {
      return { ...d, wallPatternEnabled: false };
    }
    return raw;
  },
  z.object({
    wallPatternEnabled: z.boolean().default(false),
    wallPattern: z.enum(['grid', 'hexgrid', 'voronoi', 'voronoigrid', 'voronoihexgrid']),
    lipStyle: z.enum(['normal', 'reduced', 'minimum', 'none']),
    fingerSlide: z.enum(['none', 'rounded', 'chamfered']),
    wallCutout: z.object({
      front: z.boolean(),
      back: z.boolean(),
      left: z.boolean(),
      right: z.boolean(),
    }),
    height: z.number().int().min(1).max(20),
  })
);

const placedItemSchema = z.object({
  itemId: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1).max(10),
  height: z.number().int().min(1).max(10),
  rotation: z.number().refine((v) => [0, 90, 180, 270].includes(v), {
    message: 'Rotation must be 0, 90, 180, or 270',
  }),
  customization: binCustomizationSchema.optional(),
});

const refImagePlacementSchema = z.object({
  refImageId: z.number().int().positive(),
  name: z.string().min(1).max(255),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().positive().max(100),
  height: z.number().positive().max(100),
  opacity: z.number().min(0).max(1),
  scale: z.number().min(0.1).max(10),
  isLocked: z.boolean(),
  rotation: z.number().refine((v) => [0, 90, 180, 270].includes(v), {
    message: 'Rotation must be 0, 90, 180, or 270',
  }),
});

const createLayoutSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  customerId: z.number().int().positive().optional().nullable(),
  gridX: z.number().int().min(1).max(20),
  gridY: z.number().int().min(1).max(20),
  widthMm: z.number().positive(),
  depthMm: z.number().positive(),
  spacerHorizontal: z.string().optional(),
  spacerVertical: z.string().optional(),
  placedItems: z.array(placedItemSchema).max(200),
  refImagePlacements: z.array(refImagePlacementSchema).max(50).optional(),
});

const updateLayoutMetaSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  customerId: z.number().int().positive().optional().nullable(),
}).refine(data => data.name !== undefined || data.description !== undefined || data.customerId !== undefined, {
  message: 'At least one field must be provided',
});

export async function listLayouts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const limitStr = typeof req.query.limit === 'string' ? req.query.limit : '20';
    const limit = Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100);
    const customerIdStr = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const customerId = customerIdStr ? parseInt(customerIdStr, 10) : undefined;

    const result = await layoutService.getAllLayouts(cursor, limit, customerId);

    const body: ApiListResponse<ApiLayout> = {
      data: result.data,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function getLayout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const layoutId = parseInt(req.params.id as string, 10);
    if (isNaN(layoutId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
    }

    const layout = await layoutService.getLayoutById(layoutId);

    const body: ApiResponse<ApiLayoutDetail> = { data: layout };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function createLayout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const layout = await layoutService.createLayout(parsed.data);

    const body: ApiResponse<ApiLayoutDetail> = { data: layout };
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
}

export async function updateLayout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const layoutId = parseInt(req.params.id as string, 10);
    if (isNaN(layoutId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
    }

    const parsed = createLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const layout = await layoutService.updateLayout(layoutId, parsed.data);

    const body: ApiResponse<ApiLayoutDetail> = { data: layout };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function updateLayoutMeta(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const layoutId = parseInt(req.params.id as string, 10);
    if (isNaN(layoutId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
    }

    const parsed = updateLayoutMetaSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const layout = await layoutService.updateLayoutMeta(layoutId, parsed.data);

    const body: ApiResponse<ApiLayout> = { data: layout };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function deleteLayout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const layoutId = parseInt(req.params.id as string, 10);
    if (isNaN(layoutId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
    }

    await layoutService.deleteLayout(layoutId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

function parseLayoutId(req: Request): number {
  const layoutId = parseInt(req.params.id as string, 10);
  if (isNaN(layoutId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
  }
  return layoutId;
}

export async function cloneLayout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const layoutId = parseLayoutId(req);
    const layout = await layoutService.cloneLayout(layoutId);

    const body: ApiResponse<ApiLayoutDetail> = { data: layout };
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
}
