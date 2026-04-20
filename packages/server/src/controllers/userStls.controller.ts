import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { client } from '../db/client.js';
import { config } from '../config.js';
import {
  createUpload,
  getUploadById,
  listByUser,
  updateUploadMeta,
  deleteUpload,
  resetToPending,
  checkQuota,
} from '../services/userStls.service.js';
import { processUpload, getImageOutputDir } from '../services/stlProcessing.service.js';
import type { ApiUserStl } from '@gridfinity/shared';
import type { UploadRow } from '../services/userStls.service.js';

function toApiUserStl(row: UploadRow): ApiUserStl {
  return {
    id: row.id,
    name: row.name,
    gridX: row.gridX,
    gridY: row.gridY,
    imageUrl: row.imageUrl,
    perspImageUrls: row.perspImageUrls ? JSON.parse(row.perspImageUrls) as string[] : [],
    status: row.status as ApiUserStl['status'],
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  };
}

function checkOwnership(row: UploadRow, req: Request, res: Response): boolean {
  if (req.user!.userId !== row.userId && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

export async function uploadHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required' });
    const name: string = ((req.body as Record<string, string>).name) || req.file.originalname.replace(/\.[^.]+$/, '');
    if (!name.trim()) return res.status(400).json({ error: 'Name required' });

    const exceeded = await checkQuota(client, req.user!.userId);
    if (exceeded) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(409).json({ error: 'Upload quota exceeded' });
    }

    // Generate upload ID and move file to user subdirectory with final name
    const uploadId = randomUUID();
    const userDir = path.join(config.USER_STL_DIR, String(req.user!.userId));
    await fs.mkdir(userDir, { recursive: true });
    const ext = path.extname(req.file.originalname).toLowerCase();
    const destPath = path.join(userDir, `${uploadId}${ext}`);
    await fs.rename(req.file.path, destPath);

    await createUpload(client, {
      id: uploadId,
      userId: req.user!.userId,
      name: name.trim(),
      originalFilename: req.file.originalname,
      filePath: destPath,
    });

    // Fire-and-forget processing
    const imageDir = getImageOutputDir(req.user!.userId);
    void processUpload(uploadId, destPath, imageDir, req.user!.userId);

    const row = await getUploadById(client, uploadId);
    return res.status(201).json(toApiUserStl(row!));
  } catch (err) {
    next(err);
  }
}

export async function listHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await listByUser(client, req.user!.userId);
    return res.json(rows.map(toApiUserStl));
  } catch (err) {
    next(err);
  }
}

export async function getOneHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await getUploadById(client, req.params.id as string);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!checkOwnership(row, req, res)) return;
    return res.json(toApiUserStl(row));
  } catch (err) {
    next(err);
  }
}

export async function updateMetaHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await getUploadById(client, req.params.id as string);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!checkOwnership(row, req, res)) return;

    const body = req.body as { name?: string; gridX?: number; gridY?: number };
    await updateUploadMeta(client, req.params.id as string, {
      name: body.name,
      gridX: body.gridX,
      gridY: body.gridY,
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
    if (!checkOwnership(row, req, res)) return;

    // Delete STL file
    await fs.unlink(row.filePath).catch(() => {});

    // Delete preview images
    if (row.imageUrl) {
      const imageDir = path.join(config.USER_STL_IMAGE_DIR, String(row.userId));
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
    if (!checkOwnership(row, req, res)) return;
    if (!req.file) return res.status(400).json({ error: 'File required' });

    await fs.unlink(row.filePath).catch(() => {});

    const userDir = path.join(config.USER_STL_DIR, String(row.userId));
    const ext = path.extname(req.file.originalname).toLowerCase();
    const destPath = path.join(userDir, `${row.id}${ext}`);
    await fs.rename(req.file.path, destPath);

    await client.execute({
      sql: `UPDATE user_stl_uploads SET file_path = ?, original_filename = ?, updated_at = ? WHERE id = ?`,
      args: [destPath, req.file.originalname, new Date().toISOString(), row.id],
    });
    await resetToPending(client, row.id);

    const imageDir = getImageOutputDir(row.userId);
    void processUpload(row.id, destPath, imageDir, row.userId);

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
    if (!checkOwnership(row, req, res)) return;

    await resetToPending(client, row.id);
    const imageDir = getImageOutputDir(row.userId);
    void processUpload(row.id, row.filePath, imageDir, row.userId);

    return res.status(202).json({ message: 'Reprocessing started' });
  } catch (err) {
    next(err);
  }
}

export async function downloadFileHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await getUploadById(client, req.params.id as string);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!checkOwnership(row, req, res)) return;

    // Sanitize filename: allow only safe ASCII word chars, dots, hyphens, spaces
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
    if (!checkOwnership(row, req, res)) return;

    const filename = req.params.filename as string;
    if (filename.includes('..') || filename.includes('/') || filename.includes('\0')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const imageDir = path.join(config.USER_STL_IMAGE_DIR, String(row.userId));
    const resolved = path.resolve(imageDir, filename);
    if (!resolved.startsWith(path.resolve(imageDir))) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    return res.sendFile(resolved);
  } catch (err) {
    next(err);
  }
}
