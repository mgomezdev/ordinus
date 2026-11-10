import { randomBytes } from 'node:crypto';
import { resolve, sep, isAbsolute } from 'node:path';
import type { Row } from '@libsql/client';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { GuestLink, GuestPreview } from '@gridfinity/shared';
import { authClient as client } from '../db/connection.js';
import { hashToken } from './auth.service.js';
import { config } from '../config.js';
import { prepareGuestModels } from './guestModels.service.js';

export const GUEST_COOKIE = 'ordinus_guest';
export class GuestAccessClosed extends Error {}
export interface GuestAccess { linkId: string; layoutId: number; expiresAt: number }
function linkMetadata(row: Row): GuestLink {
  return { id: String(row.id), createdAt: new Date(Number(row.created_at)).toISOString(), expiresAt: new Date(Number(row.expires_at)).toISOString(), revokedAt: row.revoked_at === null ? null : new Date(Number(row.revoked_at)).toISOString() };
}
async function requireLayout(layoutId: number): Promise<void> {
  if (!(await client.execute({ sql: 'SELECT id FROM layouts WHERE id = ?', args: [layoutId] })).rows.length) throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
}
export async function createGuestLink(layoutId: number, hours: number): Promise<GuestLink & { secret: string }> {
  await requireLayout(layoutId);
  await prepareGuestModels(layoutId);
  const id = randomBytes(12).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  const now = Date.now();
  const result = await client.execute({
    sql: 'INSERT INTO guest_links (id, layout_id, token_hash, created_at, expires_at) SELECT ?, id, ?, ?, ? FROM layouts WHERE id = ? RETURNING *',
    args: [id, hashToken(secret), now, now + hours * 3600_000, layoutId],
  });
  if (!result.rows.length) throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  return { ...linkMetadata(result.rows[0]), secret };
}
export async function listGuestLinks(layoutId: number): Promise<GuestLink[]> {
  await requireLayout(layoutId);
  const result = await client.execute({ sql: 'SELECT id, created_at, expires_at, revoked_at FROM guest_links WHERE layout_id = ? ORDER BY created_at DESC', args: [layoutId] });
  return result.rows.map(linkMetadata);
}
export async function revokeGuestLink(layoutId: number, id: string): Promise<void> {
  const result = await client.execute({ sql: 'UPDATE guest_links SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND layout_id = ?', args: [Date.now(), id, layoutId] });
  if (!result.rowsAffected) throw new AppError(ErrorCodes.NOT_FOUND, 'Preview link not found');
}
export async function joinGuestLink(id: string, secret: string): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const result = await client.execute({
    sql: `INSERT INTO guest_sessions (token_hash, link_id, expires_at)
      SELECT ?, g.id, g.expires_at FROM guest_links g JOIN layouts l ON l.id = g.layout_id
      WHERE g.id = ? AND g.token_hash = ? AND g.revoked_at IS NULL AND g.expires_at > ? RETURNING expires_at`,
    args: [hashToken(token), id, hashToken(secret), now],
  });
  if (!result.rows.length) throw new GuestAccessClosed();
  await client.execute({ sql: 'DELETE FROM guest_sessions WHERE expires_at <= ?', args: [now] });
  return { token, expiresAt: Number(result.rows[0].expires_at) };
}
export async function guestAccess(id: string, token: string): Promise<GuestAccess> {
  if (!/^[a-f0-9]{24}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new GuestAccessClosed();
  const result = await client.execute({
    sql: `SELECT g.layout_id, MIN(g.expires_at, s.expires_at) AS expires_at FROM guest_sessions s
      JOIN guest_links g ON s.link_id = g.id JOIN layouts l ON l.id = g.layout_id
      WHERE g.id = ? AND s.token_hash = ? AND g.revoked_at IS NULL AND g.expires_at > ? AND s.expires_at > ?`,
    args: [id, hashToken(token), Date.now(), Date.now()],
  });
  if (!result.rows.length) throw new GuestAccessClosed();
  return { linkId: id, layoutId: Number(result.rows[0].layout_id), expiresAt: Number(result.rows[0].expires_at) };
}
export async function leaveGuestLink(id: string, token: string): Promise<void> {
  await client.execute({ sql: 'DELETE FROM guest_sessions WHERE link_id = ? AND token_hash = ?', args: [id, hashToken(token)] });
}
function binHeight(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  try {
    const value = (JSON.parse(raw) as { height?: unknown }).height;
    return typeof value === 'number' ? value : null;
  } catch { return null; }
}
export async function getGuestPreview(access: GuestAccess): Promise<GuestPreview> {
  // One read transaction produces a consistent layout projection. The separate
  // persistent auth connection never observes an unfinished owner layout save.
  const [layouts, bins, images] = await client.batch([
    { sql: 'SELECT name, grid_x, grid_y, grid_resolution, width_mm, depth_mm, spacer_horizontal, spacer_vertical, updated_at FROM layouts WHERE id = ?', args: [access.layoutId] },
    { sql: `SELECT p.id, p.x, p.y, p.width, p.height, p.rotation, p.customization, p.custom_spec,
        COALESCE(li.name, u.name, CASE WHEN p.custom_spec IS NOT NULL THEN 'Custom bin' ELSE 'Bin' END) AS name
        FROM placed_items p LEFT JOIN library_items li ON li.library_id = p.library_id AND li.id = p.item_id
        LEFT JOIN user_stl_uploads u ON p.library_id = 'user-stl' AND u.id = p.item_id
        WHERE p.layout_id = ? ORDER BY p.sort_order`, args: [access.layoutId] },
    { sql: `SELECT r.id, r.name, r.x, r.y, r.width, r.height, r.opacity, r.scale, r.rotation, r.corners, r.warped_file_path, f.file_path
        FROM reference_images r LEFT JOIN ref_images f ON f.id = r.ref_image_id WHERE r.layout_id = ? ORDER BY r.id`, args: [access.layoutId] },
  ], 'read');
  const layout = layouts.rows[0];
  if (!layout) throw new GuestAccessClosed();
  return {
    name: String(layout.name), gridX: Number(layout.grid_x), gridY: Number(layout.grid_y), gridResolution: Number(layout.grid_resolution),
    widthMm: Number(layout.width_mm), depthMm: Number(layout.depth_mm), spacerHorizontal: String(layout.spacer_horizontal), spacerVertical: String(layout.spacer_vertical), savedAt: String(layout.updated_at),
    bins: bins.rows.map(row => ({ id: Number(row.id), name: String(row.name), x: Number(row.x), y: Number(row.y), width: Number(row.width), depth: Number(row.height), rotation: Number(row.rotation), heightUnits: binHeight(row.custom_spec) ?? binHeight(row.customization) })),
    referenceImages: images.rows.filter(row => row.file_path || row.warped_file_path).map(row => ({
      id: Number(row.id), name: String(row.name), url: `/api/v1/guest/${access.linkId}/assets/${row.id}`,
      x: Number(row.x), y: Number(row.y), width: Number(row.width), height: Number(row.height), opacity: Number(row.opacity), scale: Number(row.scale), rotation: Number(row.rotation), isAligned: Boolean(row.corners && row.warped_file_path),
    })),
  };
}
export async function guestImagePath(access: GuestAccess, placementId: number): Promise<string> {
  const result = await client.execute({
    sql: `SELECT r.corners, r.warped_file_path, f.file_path FROM reference_images r LEFT JOIN ref_images f ON f.id = r.ref_image_id WHERE r.layout_id = ? AND r.id = ?`,
    args: [access.layoutId, placementId],
  });
  const row = result.rows[0];
  const relative = row ? (row.corners && row.warped_file_path ? row.warped_file_path : row.file_path) : null;
  if (typeof relative !== 'string' || isAbsolute(relative)) throw new AppError(ErrorCodes.NOT_FOUND, 'Image not found');
  const root = resolve(config.IMAGE_DIR);
  const file = resolve(root, relative);
  if (!file.startsWith(root + sep) || !/\.(webp|png|jpe?g)$/i.test(file)) throw new AppError(ErrorCodes.NOT_FOUND, 'Image not found');
  return file;
}
