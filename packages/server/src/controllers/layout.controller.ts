import { z } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiResponse, ApiListResponse, ApiLayout, ApiLayoutDetail, LayoutStatusCount } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import * as layoutService from '../services/layout.service.js';

const binCustomizationSchema = z.object({
  wallPattern: z.enum(['none', 'grid', 'hexgrid', 'voronoi', 'voronoigrid', 'voronoihexgrid']),
  lipStyle: z.enum(['normal', 'reduced', 'minimum', 'none']),
  fingerSlide: z.enum(['none', 'rounded', 'chamfered']),
  wallCutout: z.enum(['none', 'vertical', 'horizontal', 'both']),
  height: z.number().int().min(1).max(20),
});

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
}).refine(data => data.name !== undefined || data.description !== undefined, {
  message: 'At least one field must be provided',
});

export async function listLayouts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const limitStr = typeof req.query.limit === 'string' ? req.query.limit : '20';
    const limit = Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100);

    const result = await layoutService.getLayoutsByUser(req.user.userId, cursor, limit);

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
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const layoutId = parseInt(req.params.id as string, 10);
    if (isNaN(layoutId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
    }

    const isAdmin = req.user.role === 'admin';
    const layout = await layoutService.getLayoutById(layoutId, req.user.userId, isAdmin);

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
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const parsed = createLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const layout = await layoutService.createLayout(req.user.userId, parsed.data);

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
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const layoutId = parseInt(req.params.id as string, 10);
    if (isNaN(layoutId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
    }

    const parsed = createLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const isAdmin = req.user.role === 'admin';
    const layout = await layoutService.updateLayout(layoutId, req.user.userId, parsed.data, isAdmin);

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
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const layoutId = parseInt(req.params.id as string, 10);
    if (isNaN(layoutId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
    }

    const parsed = updateLayoutMetaSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const layout = await layoutService.updateLayoutMeta(layoutId, req.user.userId, parsed.data);

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
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const layoutId = parseInt(req.params.id as string, 10);
    if (isNaN(layoutId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
    }

    await layoutService.deleteLayout(layoutId, req.user.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ============================================================
// Status transition handlers
// ============================================================

function parseLayoutId(req: Request): number {
  const layoutId = parseInt(req.params.id as string, 10);
  if (isNaN(layoutId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
  }
  return layoutId;
}

export async function submitLayout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const layoutId = parseLayoutId(req);
    const layout = await layoutService.submitLayout(layoutId, req.user.userId);

    const body: ApiResponse<ApiLayout> = { data: layout };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function withdrawLayout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const layoutId = parseLayoutId(req);
    const isAdmin = req.user.role === 'admin';
    const layout = await layoutService.withdrawLayout(layoutId, req.user.userId, isAdmin);

    const body: ApiResponse<ApiLayout> = { data: layout };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function cloneLayout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const layoutId = parseLayoutId(req);
    const isAdmin = req.user.role === 'admin';
    const layout = await layoutService.cloneLayout(layoutId, req.user.userId, isAdmin);

    const body: ApiResponse<ApiLayoutDetail> = { data: layout };
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
}

export async function deliverLayout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const layoutId = parseLayoutId(req);
    const layout = await layoutService.deliverLayout(layoutId);

    const body: ApiResponse<ApiLayout> = { data: layout };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function listAdminLayouts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const limitStr = typeof req.query.limit === 'string' ? req.query.limit : '20';
    const limit = Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100);

    // Validate status filter
    if (statusFilter && !['draft', 'submitted', 'delivered'].includes(statusFilter)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid status filter');
    }

    const result = await layoutService.getAdminLayouts(statusFilter, cursor, limit);

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

export async function getSubmittedCount(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const submitted = await layoutService.getSubmittedCount();

    const body: ApiResponse<LayoutStatusCount> = { data: { submitted } };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function getAdminUsers(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userList = await layoutService.getUsers();
    res.status(200).json({ data: userList });
  } catch (err) {
    next(err);
  }
}

export async function listAdminUserLayouts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userIdStr = (req.params?.userId ?? req.query.userId) as string | undefined;
    if (!userIdStr) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'userId param required');
    const userId = parseInt(userIdStr, 10);
    if (isNaN(userId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid userId');

    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const limitStr = typeof req.query.limit === 'string' ? req.query.limit : '20';
    const limit = Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100);

    const result = await layoutService.getLayoutsByUser(userId, cursor, limit);
    res.status(200).json({
      data: result.data,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (err) {
    next(err);
  }
}
