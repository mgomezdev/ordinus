import { randomUUID } from 'crypto';
import type { Client } from '@libsql/client';

export interface CreateUploadParams {
  id?: string;           // optional — if omitted, a UUID is generated
  userId: number;
  name: string;
  originalFilename: string;
  filePath: string;
}

export interface UploadRow {
  id: string;
  userId: number;
  name: string;
  originalFilename: string;
  filePath: string;
  imageUrl: string | null;
  perspImageUrls: string | null; // raw JSON string
  gridX: number | null;
  gridY: number | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createUpload(client: Client, params: CreateUploadParams): Promise<string> {
  const id = params.id ?? randomUUID();
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO user_stl_uploads
      (id, user_id, name, original_filename, file_path, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    args: [id, params.userId, params.name, params.originalFilename, params.filePath, now, now],
  });
  return id;
}

export async function getUploadById(client: Client, id: string): Promise<UploadRow | null> {
  const result = await client.execute({
    sql: `SELECT id, user_id, name, original_filename, file_path, image_url,
                 persp_image_urls, grid_x, grid_y, status, error_message, created_at, updated_at
          FROM user_stl_uploads WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return rowToUpload(result.rows[0]);
}

export async function listByUser(client: Client, userId: number): Promise<UploadRow[]> {
  const result = await client.execute({
    sql: `SELECT id, user_id, name, original_filename, file_path, image_url,
                 persp_image_urls, grid_x, grid_y, status, error_message, created_at, updated_at
          FROM user_stl_uploads WHERE user_id = ? ORDER BY created_at DESC`,
    args: [userId],
  });
  return result.rows.map(rowToUpload);
}

export async function listAllForAdmin(client: Client): Promise<(UploadRow & { userName: string })[]> {
  const result = await client.execute({
    sql: `SELECT u.id, u.user_id, u.name, u.original_filename, u.file_path, u.image_url,
                 u.persp_image_urls, u.grid_x, u.grid_y, u.status, u.error_message,
                 u.created_at, u.updated_at, us.username as user_name
          FROM user_stl_uploads u
          JOIN users us ON us.id = u.user_id
          ORDER BY u.updated_at DESC`,
    args: [],
  });
  return result.rows.map((row) => ({ ...rowToUpload(row), userName: String(row.user_name) }));
}

export async function updateUploadStatus(
  client: Client,
  id: string,
  status: 'pending' | 'processing' | 'ready' | 'error',
  data?: {
    imageUrl?: string;
    perspImageUrls?: string[];
    gridX?: number;
    gridY?: number;
    errorMessage?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await client.execute({
    sql: `UPDATE user_stl_uploads SET
            status = ?,
            image_url = COALESCE(?, image_url),
            persp_image_urls = COALESCE(?, persp_image_urls),
            grid_x = COALESCE(?, grid_x),
            grid_y = COALESCE(?, grid_y),
            error_message = ?,
            updated_at = ?
          WHERE id = ?`,
    args: [
      status,
      data?.imageUrl ?? null,
      data?.perspImageUrls ? JSON.stringify(data.perspImageUrls) : null,
      data?.gridX ?? null,
      data?.gridY ?? null,
      data?.errorMessage ?? null,
      now,
      id,
    ],
  });
}

export async function updateUploadMeta(
  client: Client,
  id: string,
  params: { name?: string; gridX?: number | null; gridY?: number | null },
): Promise<void> {
  const now = new Date().toISOString();
  await client.execute({
    sql: `UPDATE user_stl_uploads SET
            name = COALESCE(?, name),
            grid_x = ?,
            grid_y = ?,
            updated_at = ?
          WHERE id = ?`,
    args: [params.name ?? null, params.gridX ?? null, params.gridY ?? null, now, id],
  });
}

export async function deleteUpload(client: Client, id: string): Promise<void> {
  await client.execute({ sql: `DELETE FROM user_stl_uploads WHERE id = ?`, args: [id] });
}

export async function resetToPending(client: Client, id: string): Promise<void> {
  const now = new Date().toISOString();
  await client.execute({
    sql: `UPDATE user_stl_uploads SET status = 'pending', error_message = NULL, updated_at = ? WHERE id = ?`,
    args: [now, id],
  });
}

export async function getPendingAndProcessingIds(client: Client): Promise<string[]> {
  const result = await client.execute({
    sql: `SELECT id FROM user_stl_uploads WHERE status IN ('pending', 'processing')`,
    args: [],
  });
  return result.rows.map((r) => String(r.id));
}

export async function checkQuota(client: Client, userId: number): Promise<boolean> {
  const countResult = await client.execute({
    sql: `SELECT COUNT(*) as cnt FROM user_stl_uploads WHERE user_id = ?`,
    args: [userId],
  });
  const count = Number(countResult.rows[0].cnt);

  const storageResult = await client.execute({
    sql: `SELECT max_user_stls FROM user_storage WHERE user_id = ?`,
    args: [userId],
  });
  const maxUserStls = storageResult.rows.length > 0
    ? Number(storageResult.rows[0].max_user_stls)
    : 50;

  return count >= maxUserStls;
}

function rowToUpload(row: Record<string, unknown>): UploadRow {
  return {
    id: String(row.id),
    userId: Number(row.user_id),
    name: String(row.name),
    originalFilename: String(row.original_filename),
    filePath: String(row.file_path),
    imageUrl: row.image_url ? String(row.image_url) : null,
    perspImageUrls: row.persp_image_urls ? String(row.persp_image_urls) : null,
    gridX: row.grid_x != null ? Number(row.grid_x) : null,
    gridY: row.grid_y != null ? Number(row.grid_y) : null,
    status: String(row.status),
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
