import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { client } from '../db/client.js';
import { config } from '../config.js';
import {
  createUpload,
  getUploadById,
  listAll,
  listByCustomer,
  updateUploadMeta,
  deleteUpload,
  resetToPending,
} from '../services/userStls.service.js';
import { validateStlDimensions } from '../services/stlDimensions.js';
import { processUpload, getImageOutputDir } from '../services/stlProcessing.service.js';
import type { ApiUserStl } from '@gridfinity/shared';
import type { UploadRow } from '../services/userStls.service.js';

function toApiUserStl(row: UploadRow): ApiUserStl {
  return {
    id: row.id,
    name: row.name,
    gridX: row.gridX,
    gridY: row.gridY,
    gridZ: row.gridZ,
    visibility: (row.visibility ?? 'private') as 'private' | 'public',
    imageUrl: row.imageUrl,
    perspImageUrls: row.perspImageUrls ? JSON.parse(row.perspImageUrls) as string[] : [],
    status: row.status as ApiUserStl['status'],
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  };
}

export async function uploadHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.stl') {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Only .stl files are supported for custom part uploads.' });
    }

    const body = req.body as Record<string, string>;
    const name: string = body.name || req.file.originalname.replace(/\.[^.]+$/, '');
    if (!name.trim()) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Name required' });
    }

    const gridX = body.gridX ? parseInt(body.gridX, 10) : undefined;
    const gridY = body.gridY ? parseInt(body.gridY, 10) : undefined;
    const gridZ = body.gridZ ? parseInt(body.gridZ, 10) : undefined;
    const visibility = body.visibility === 'public' ? 'public' : 'private';

    if (gridX != null && gridY != null && gridZ != null) {
      if (gridX < 1 || gridY < 1 || gridZ < 1) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ error: 'Grid dimensions must be at least 1.' });
      }
      const buf = await fs.readFile(req.file.path);
      const dimError = validateStlDimensions(buf, gridX, gridY, gridZ);
      if (dimError) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(422).json({ error: dimError });
      }
    }

    const uploadId = randomUUID();
    const uploadDir = path.join(config.USER_STL_DIR, 'global');
    await fs.mkdir(uploadDir, { recursive: true });
    const destPath = path.join(uploadDir, `${uploadId}.stl`);
    await fs.rename(req.file.path, destPath);

    await createUpload(client, {
      id: uploadId,
      name: name.trim(),
      originalFilename: req.file.originalname,
      filePath: destPath,
      gridX,
      gridY,
      gridZ,
      visibility,
    });

    const imageDir = getImageOutputDir(null);
    void processUpload(uploadId, destPath, imageDir, null);

    const row = await getUploadById(client, uploadId);
    return res.status(201).json(toApiUserStl(row!));
  } catch (err) {
    next(err);
  }
}

export async function listHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const customerIdStr = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const customerId = customerIdStr ? parseInt(customerIdStr, 10) : undefined;

    let rows: UploadRow[];
    if (customerId !== undefined && !isNaN(customerId)) {
      rows = await listByCustomer(client, customerId);
    } else {
      rows = await listAll(client);
    }
    return res.json(rows.map(toApiUserStl));
  } catch (err) {
    next(err);
  }
}

export async function getOneHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await getUploadById(client, req.params.id as string);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(toApiUserStl(row));
  } catch (err) {
    next(err);
  }
}

export async function updateMetaHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await getUploadById(client, req.params.id as string);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const body = req.body as { name?: string; gridX?: number; gridY?: number; gridZ?: number; visibility?: string };
    await updateUploadMeta(client, req.params.id as string, {
      name: body.name,
      gridX: body.gridX,
      gridY: body.gridY,
      gridZ: body.gridZ,
      visibility: body.visibility,
    });

    const updated = await getUploadById(client, req.params.id as string);
    return res.json(toApiUserStl(updated!));
  } catch (err) {
    next(err);
  }
}

export async function deleteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await getUploadById(client, req.params.id as string);
    if (!row) return res.status(404).json({ error: 'Not found' });

    // Delete STL file
    await fs.unlink(row.filePath).catch(() => {});

    // Delete preview images
    if (row.imageUrl) {
      const imageDir = path.join(config.USER_STL_IMAGE_DIR, 'global');
      await fs.unlink(path.join(imageDir, row.imageUrl)).catch(() => {});
      const persp: string[] = row.perspImageUrls ? JSON.parse(row.perspImageUrls) as string[] : [];
      for (const f of persp) {
        await fs.unlink(path.join(imageDir, f)).catch(() => {});
      }
    }

    await deleteUpload(client, req.params.id as string);
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function replaceFileHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await getUploadById(client, req.params.id as string);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!req.file) return res.status(400).json({ error: 'File required' });

    await fs.unlink(row.filePath).catch(() => {});

    const uploadDir = path.join(config.USER_STL_DIR, 'global');
    const ext = path.extname(req.file.originalname).toLowerCase();
    const destPath = path.join(uploadDir, `${row.id}${ext}`);
    await fs.rename(req.file.path, destPath);

    await client.execute({
      sql: `UPDATE user_stl_uploads SET file_path = ?, original_filename = ?, updated_at = ? WHERE id = ?`,
      args: [destPath, req.file.originalname, new Date().toISOString(), row.id],
    });
    await resetToPending(client, row.id);

    const imageDir = getImageOutputDir(null);
    void processUpload(row.id, destPath, imageDir, null);

    const updated = await getUploadById(client, row.id);
    return res.json(toApiUserStl(updated!));
  } catch (err) {
    next(err);
  }
}

export async function reprocessHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await getUploadById(client, req.params.id as string);
    if (!row) return res.status(404).json({ error: 'Not found' });

    await resetToPending(client, row.id);
    const imageDir = getImageOutputDir(null);
    void processUpload(row.id, row.filePath, imageDir, null);

    return res.status(202).json({ message: 'Reprocessing started' });
  } catch (err) {
    next(err);
  }
}

export async function downloadFileHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await getUploadById(client, req.params.id as string);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const safeFilename = row.originalFilename.replace(/[^\w.\- ]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.sendFile(row.filePath);
  } catch (err) {
    next(err);
  }
}

export async function serveImageHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await getUploadById(client, req.params.id as string);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const filename = req.params.filename as string;
    if (filename.includes('..') || filename.includes('/') || filename.includes('\0')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const imageDir = path.join(config.USER_STL_IMAGE_DIR, 'global');
    const resolved = path.resolve(imageDir, filename);
    if (!resolved.startsWith(path.resolve(imageDir))) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    return res.sendFile(resolved);
  } catch (err) {
    next(err);
  }
}
