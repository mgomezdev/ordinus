import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { client } from '../db/client.js';
import { config } from '../config.js';
import { listAllForAdmin, getUploadById } from '../services/userStls.service.js';
import type { ApiUserStlAdmin } from '@gridfinity/shared';
import type { UploadRow } from '../services/userStls.service.js';

function toApiAdmin(row: UploadRow & { userName: string }): ApiUserStlAdmin {
  return {
    id: row.id,
    name: row.name,
    gridX: row.gridX,
    gridY: row.gridY,
    imageUrl: row.imageUrl,
    perspImageUrls: row.perspImageUrls ? JSON.parse(row.perspImageUrls) as string[] : [],
    status: row.status as ApiUserStlAdmin['status'],
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    userId: row.userId,
    userName: row.userName,
    originalFilename: row.originalFilename,
    updatedAt: row.updatedAt,
  };
}

export async function listAllHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await listAllForAdmin(client);
    return res.json(rows.map(toApiAdmin));
  } catch (err) {
    next(err);
  }
}

export async function promoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await getUploadById(client, req.params.id as string);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.status !== 'ready') return res.status(409).json({ error: 'Upload is not ready' });

    const destDir = path.join('public', 'libraries', 'user-uploads');
    await fs.mkdir(destDir, { recursive: true });

    // Copy STL file
    const stlExt = path.extname(row.filePath);
    const stlDest = path.join(destDir, `${row.id}${stlExt}`);
    await fs.copyFile(row.filePath, stlDest);

    // Copy images
    const imageDir = path.join(config.USER_STL_IMAGE_DIR, String(row.userId));
    const persp: string[] = row.perspImageUrls ? JSON.parse(row.perspImageUrls) as string[] : [];
    const allImages = [...(row.imageUrl ? [row.imageUrl] : []), ...persp];
    for (const img of allImages) {
      await fs.copyFile(path.join(imageDir, img), path.join(destDir, img)).catch(() => {});
    }

    // Update index.json atomically
    const indexPath = path.join(destDir, 'index.json');
    let index: { items: Array<Record<string, unknown>> } = { items: [] };
    try {
      const raw = await fs.readFile(indexPath, 'utf-8');
      index = JSON.parse(raw) as typeof index;
    } catch {
      // file doesn't exist yet
    }

    const entry = {
      id: row.id,
      name: row.name,
      widthUnits: row.gridX ?? 1,
      heightUnits: row.gridY ?? 1,
      imageUrl: row.imageUrl ?? undefined,
      perspImageUrls: persp,
    };

    index.items = [
      ...index.items.filter((i) => i.id !== row.id),
      entry,
    ];

    const tmpPath = indexPath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(index, null, 2));
    await fs.rename(tmpPath, indexPath);

    return res.json({ message: 'Promoted successfully' });
  } catch (err) {
    next(err);
  }
}
