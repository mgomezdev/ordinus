import { z } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse, ApiListResponse, ApiLibrary, ApiLibraryItem, ApiCategory } from '@gridfinity/shared';
import * as libraryService from '../services/library.service.js';
import * as imageServiceModule from '../services/image.service.js';

export async function listLibraries(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const activeOnly = req.query.active === 'true';
    const libraries = await libraryService.getAllLibraries(activeOnly);

    const body: ApiListResponse<ApiLibrary> = { data: libraries };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function getLibrary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const library = await libraryService.getLibraryById(req.params.id as string);

    const body: ApiResponse<ApiLibrary> = { data: library };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function listLibraryItems(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters = {
      category: req.query.category as string | undefined,
      width: req.query.width ? Number(req.query.width) : undefined,
      height: req.query.height ? Number(req.query.height) : undefined,
    };

    const items = await libraryService.getLibraryItems(req.params.libraryId as string, filters);

    const body: ApiListResponse<ApiLibraryItem> = { data: items };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function getLibraryItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const item = await libraryService.getLibraryItemById(
      req.params.libraryId as string,
      req.params.itemId as string,
    );

    const body: ApiResponse<ApiLibraryItem> = { data: item };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function listCategories(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const categories = await libraryService.getAllCategories();

    const body: ApiListResponse<ApiCategory> = { data: categories };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

// ============================================================
// Admin CRUD controllers
// ============================================================

const createLibrarySchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/, 'ID must contain only lowercase letters, numbers, hyphens, and underscores'),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  version: z.string().max(20).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateLibrarySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

const createItemSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  widthUnits: z.number().int().min(1).max(10),
  heightUnits: z.number().int().min(1).max(10),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  imagePath: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
  categories: z.array(z.string().min(1)).optional(),
});

const updateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  widthUnits: z.number().int().min(1).max(10).optional(),
  heightUnits: z.number().int().min(1).max(10).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  imagePath: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  categories: z.array(z.string().min(1)).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

export async function createLibrary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createLibrarySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const library = await libraryService.createLibrary(parsed.data);

    const body: ApiResponse<ApiLibrary> = { data: library };
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
}

export async function updateLibrary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = updateLibrarySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const library = await libraryService.updateLibrary(req.params.id as string, parsed.data);

    const body: ApiResponse<ApiLibrary> = { data: library };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function deleteLibrary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await libraryService.deleteLibrary(req.params.id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function createItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const item = await libraryService.createItem(req.params.libraryId as string, parsed.data);

    const body: ApiResponse<ApiLibraryItem> = { data: item };
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
}

export async function updateItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const item = await libraryService.updateItem(
      req.params.libraryId as string,
      req.params.itemId as string,
      parsed.data,
    );

    const body: ApiResponse<ApiLibraryItem> = { data: item };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function deleteItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await libraryService.deleteItem(req.params.libraryId as string, req.params.itemId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function uploadItemImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'No image file provided');
    }

    const libraryId = req.params.libraryId as string;
    const itemId = req.params.itemId as string;

    // Verify item exists
    await libraryService.getLibraryItemById(libraryId, itemId);

    // Process and save image
    const result = await imageServiceModule.processAndSaveImage(
      file.buffer,
      libraryId,
      `${itemId}${getExtFromOriginalname(file.originalname)}`,
    );

    // Update item with image path
    const item = await libraryService.updateItem(libraryId, itemId, {
      imagePath: result.filePath,
    });

    const body: ApiResponse<ApiLibraryItem> = { data: item };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

function getExtFromOriginalname(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return '.png';
  return name.substring(dot).toLowerCase();
}
