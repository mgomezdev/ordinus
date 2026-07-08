import { randomUUID } from 'crypto';
import type { Client } from '@libsql/client';

export interface CreateUploadParams {
  id?: string;           // optional — if omitted, a UUID is generated
  userId?: number | null;  // optional — parts are global
  name: string;
  originalFilename: string;
  filePath: string;
  gridX?: number;
  gridY?: number;
  gridZ?: number;
  visibility?: string;
}

export interface UploadRow {
  id: string;
  userId: number | null;
  name: string;
  originalFilename: string;
  filePath: string;
  imageUrl: string | null;
  perspImageUrls: string | null; // raw JSON string
  gridX: number | null;
  gridY: number | null;
  gridZ: number | null;
  visibility: string;
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
      (id, user_id, name, original_filename, file_path, grid_x, grid_y, grid_z, visibility, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    args: [id, params.userId ?? null, params.name, params.originalFilename, params.filePath,
           params.gridX ?? null, params.gridY ?? null, params.gridZ ?? null,
           params.visibility ?? 'private', now, now],
  });
  return id;
}

export async function getUploadById(client: Client, id: string): Promise<UploadRow | null> {
  const result = await client.execute({
    sql: `SELECT id, user_id, name, original_filename, file_path, image_url,
                 persp_image_urls, grid_x, grid_y, grid_z, visibility, status, error_message, created_at, updated_at
          FROM user_stl_uploads WHERE id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return rowToUpload(result.rows[0]);
}

/**
 * List all parts — implement visibility filter for customer context.
 * Parts with NO customer association → visible everywhere
 * Parts with ONE OR MORE customer associations → only visible in those customers' contexts
 * When customerId is provided, filter accordingly.
 */
export async function listAll(client: Client): Promise<UploadRow[]> {
  const result = await client.execute({
    sql: `SELECT id, user_id, name, original_filename, file_path, image_url,
                 persp_image_urls, grid_x, grid_y, grid_z, visibility, status, error_message, created_at, updated_at
          FROM user_stl_uploads ORDER BY created_at DESC`,
    args: [],
  });
  return result.rows.map(rowToUpload);
}

export async function listByCustomer(client: Client, customerId: number): Promise<UploadRow[]> {
  const result = await client.execute({
    sql: `SELECT p.id, p.user_id, p.name, p.original_filename, p.file_path, p.image_url,
                 p.persp_image_urls, p.grid_x, p.grid_y, p.grid_z, p.visibility, p.status, p.error_message, p.created_at, p.updated_at
          FROM user_stl_uploads p
          WHERE NOT EXISTS (SELECT 1 FROM customer_parts cp WHERE cp.part_id = p.id)
             OR EXISTS (SELECT 1 FROM customer_parts cp WHERE cp.part_id = p.id AND cp.customer_id = ?)
          ORDER BY p.created_at DESC`,
    args: [customerId],
  });
  return result.rows.map(rowToUpload);
}

// Keep for backward compat — now just calls listAll
export async function listByUser(client: Client, _userId: number): Promise<UploadRow[]> {
  return listAll(client);
}

export async function listPublic(client: Client): Promise<UploadRow[]> {
  const result = await client.execute({
    sql: `SELECT id, user_id, name, original_filename, file_path, image_url,
                 persp_image_urls, grid_x, grid_y, grid_z, visibility, status, error_message, created_at, updated_at
          FROM user_stl_uploads WHERE visibility = 'public' AND status = 'ready' ORDER BY created_at DESC`,
    args: [],
  });
  return result.rows.map(rowToUpload);
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
  params: { name?: string; gridX?: number | null; gridY?: number | null; gridZ?: number | null; visibility?: string },
): Promise<void> {
  const now = new Date().toISOString();
  await client.execute({
    sql: `UPDATE user_stl_uploads SET
            name = COALESCE(?, name),
            grid_x = ?,
            grid_y = ?,
            grid_z = ?,
            visibility = COALESCE(?, visibility),
            updated_at = ?
          WHERE id = ?`,
    args: [params.name ?? null, params.gridX ?? null, params.gridY ?? null,
           params.gridZ ?? null, params.visibility ?? null, now, id],
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

// No longer needed — no quota tracking without users
export async function checkQuota(_client: Client, _userId: number | null): Promise<boolean> {
  return false;
}

function rowToUpload(row: Record<string, unknown>): UploadRow {
  return {
    id: String(row.id),
    userId: row.user_id != null ? Number(row.user_id) : null,
    name: String(row.name),
    originalFilename: String(row.original_filename),
    filePath: String(row.file_path),
    imageUrl: row.image_url ? String(row.image_url) : null,
    perspImageUrls: row.persp_image_urls ? String(row.persp_image_urls) : null,
    gridX: row.grid_x != null ? Number(row.grid_x) : null,
    gridY: row.grid_y != null ? Number(row.grid_y) : null,
    gridZ: row.grid_z != null ? Number(row.grid_z) : null,
    visibility: row.visibility ? String(row.visibility) : 'private',
    status: String(row.status),
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
