import { z } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import * as favoritesService from '../services/favorites.service.js';

const binCustomizationSchema = z.object({
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
});

const createFavoriteSchema = z.object({
  name: z.string().min(1).max(255),
  libraryId: z.string().min(1),
  libraryItemId: z.string().min(1),
  libraryItemName: z.string().min(1).max(255),
  widthUnits: z.number().int().min(1).max(10),
  heightUnits: z.number().int().min(1).max(10),
  color: z.string().min(1),
  paramHash: z.string().nullable().optional(),
  imageUrl: z.string().default(''),
  perspectiveImageUrl: z.string().nullable().optional(),
  perspectiveImageUrl90: z.string().nullable().optional(),
  perspectiveImageUrl180: z.string().nullable().optional(),
  perspectiveImageUrl270: z.string().nullable().optional(),
  customization: binCustomizationSchema,
});

const renameSchema = z.object({
  name: z.string().min(1).max(255),
});

function serializeFavorite(row: favoritesService.FavoriteRow) {
  return {
    id: row.id,
    name: row.name,
    libraryId: row.libraryId,
    libraryItemId: row.libraryItemId,
    libraryItemName: row.libraryItemName,
    widthUnits: row.widthUnits,
    heightUnits: row.heightUnits,
    color: row.color,
    paramHash: row.paramHash,
    imageUrl: row.imageUrl,
    perspectiveImageUrl: row.perspectiveImageUrl,
    perspectiveImageUrl90: row.perspectiveImageUrl90,
    perspectiveImageUrl180: row.perspectiveImageUrl180,
    perspectiveImageUrl270: row.perspectiveImageUrl270,
    customization: JSON.parse(row.customization),
    createdAt: row.createdAt,
  };
}

export async function listFavorites(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const rows = await favoritesService.listFavorites(userId);
    res.json({ data: rows.map(serializeFavorite) });
  } catch (err) {
    next(err);
  }
}

export async function createFavorite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createFavoriteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'Invalid request');
    }
    const userId = req.user!.userId;
    const row = await favoritesService.createFavorite(userId, parsed.data);
    res.status(201).json({ data: serializeFavorite(row) });
  } catch (err) {
    next(err);
  }
}

export async function deleteFavorite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const deleted = await favoritesService.deleteFavorite(req.params.id as string, userId);
    if (!deleted) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Favorite not found');
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function renameFavorite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'name is required');
    }
    const userId = req.user!.userId;
    const updated = await favoritesService.renameFavorite(req.params.id as string, userId, parsed.data.name);
    if (!updated) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Favorite not found');
    }
    res.json({ data: { id: req.params.id as string, name: parsed.data.name } });
  } catch (err) {
    next(err);
  }
}
