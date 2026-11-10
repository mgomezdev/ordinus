import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Row } from '@libsql/client';
import { AppError, ErrorCodes, validateCustomBinSpec } from '@gridfinity/shared';
import type { LiveSnapshot, LiveCommand, LiveChange, GuestLink } from '@gridfinity/shared';
import * as connections from '../db/connection.js';
import { authService, hashToken } from './auth.service.js';
import { GuestAccessClosed, getGuestPreview } from './guestPreview.service.js';
import { modelRows, modelSourceSnapshot, prepareGuestModels } from './guestModels.service.js';
import { layoutWrite, layoutChanged, checkLiveGeometry } from './layoutWrites.js';
import { parseCustomization } from './formatters.js';
const client = Object.hasOwn(connections, 'liveClient') ? connections.liveClient : connections.client;

export type LiveActor = { role: 'owner'; token: string } | { role: 'guest'; token: string; linkId: string };
interface CatalogEntry { key: string; name: string; width: number; depth: number; libraryId: string; itemId: string; sourceSnapshot: string }
interface Catalog { libraryId: string; items: CatalogEntry[] }
const uuid = z.string().uuid();
const coordinate = z.number().int().min(0).max(40);
const spacer = z.enum(['none', 'one-sided', 'symmetrical']);
const commandSchema = z.object({ commandId: uuid, baseRevision: z.number().int().nonnegative(), change: z.discriminatedUnion('type', [
  z.object({ type: z.literal('add'), catalogKey: uuid, x: coordinate, y: coordinate }).strict(),
  z.object({ type: z.literal('move'), stableId: uuid, x: coordinate, y: coordinate }).strict(),
  z.object({ type: z.literal('rotate'), stableId: uuid, direction: z.enum(['cw', 'ccw']) }).strict(),
  z.object({ type: z.literal('remove'), stableId: uuid }).strict(),
  z.object({ type: z.literal('customize'), stableId: uuid, height: z.number().int().min(1).max(20), lipStyle: z.enum(['normal', 'reduced', 'minimum', 'none']), wallPatternEnabled: z.boolean() }).strict(),
  z.object({ type: z.literal('drawer'), widthMm: z.number().min(42).max(881), depthMm: z.number().min(42).max(881), spacerHorizontal: spacer, spacerVertical: spacer }).strict(),
]) }).strict();
const invalid = (message: string) => new AppError(ErrorCodes.VALIDATION_ERROR, message);
function parseCatalog(value: unknown): Catalog {
  try { return JSON.parse(String(value)) as Catalog; } catch { return { libraryId: '', items: [] }; }
}
async function layoutRow(id: number): Promise<Row> {
  const row = (await client.execute({ sql: 'SELECT * FROM layouts WHERE id = ?', args: [id] })).rows[0];
  if (!row) throw new AppError(ErrorCodes.NOT_FOUND, 'Configuration not found');
  return row;
}
async function binRows(id: number): Promise<Row[]> {
  return (await client.execute({ sql: 'SELECT * FROM placed_items WHERE layout_id = ? ORDER BY sort_order', args: [id] })).rows;
}
function validateGeometry(layout: Row, bins: Row[]): void {
  checkLiveGeometry(Number(layout.grid_x), Number(layout.grid_y), bins.map(bin => ({ x: Number(bin.x), y: Number(bin.y), width: Number(bin.width), height: Number(bin.height) })));
}
async function catalogForLibrary(libraryId: string): Promise<Catalog> {
  const library = (await client.execute({ sql: 'SELECT id FROM libraries WHERE id = ? AND is_active = 1', args: [libraryId] })).rows[0];
  if (!library) throw invalid('Choose an available bin library');
  const result = await client.execute({ sql: `SELECT li.*, l.base_model_path, l.parameters,
    (SELECT base_model_path FROM libraries WHERE id = 'bins_standard') AS custom_base
    FROM library_items li JOIN libraries l ON li.library_id = l.id WHERE li.library_id = ? AND li.is_active = 1 ORDER BY li.sort_order LIMIT 200`, args: [libraryId] });
  if (!result.rows.length) throw invalid('The approved library has no bins');
  return { libraryId, items: result.rows.map(row => ({ key: randomUUID(), name: String(row.name), width: Number(row.width_units), depth: Number(row.height_units),
    libraryId, itemId: String(row.id), sourceSnapshot: modelSourceSnapshot(row) })) };
}

/** Called inside the layout writer; activation and the invitation commit together. */
export async function createEditableLink(layoutId: number, hours: number, libraryId: string): Promise<GuestLink & { secret: string }> {
  await client.execute('BEGIN IMMEDIATE');
  let link: GuestLink & { secret: string };
  try {
    const layout = await layoutRow(layoutId); const catalog = await catalogForLibrary(libraryId);
    const before = await binRows(layoutId);
    const refs = (await client.execute({ sql: 'SELECT * FROM reference_images WHERE layout_id = ?', args: [layoutId] })).rows;
    await client.execute({ sql: 'INSERT OR IGNORE INTO live_backups(layout_id, snapshot, created_at) VALUES (?, ?, ?)', args: [layoutId, JSON.stringify({ layout, bins: before, references: refs }), Date.now()] });
    if (Number(layout.grid_resolution) === 1) await client.execute({ sql: 'UPDATE placed_items SET x=x*2, y=y*2, width=width*2, height=height*2 WHERE layout_id = ?', args: [layoutId] });
    for (const row of await modelRows(layoutId)) await client.execute({ sql: 'UPDATE placed_items SET stable_id=COALESCE(stable_id, ?), source_snapshot=COALESCE(source_snapshot, ?) WHERE id = ?', args: [randomUUID(), modelSourceSnapshot(row), row.id] });
    validateGeometry(layout, await binRows(layoutId));
    await client.execute({ sql: 'UPDATE layouts SET live_guarded=1, grid_resolution=2, revision=revision+1 WHERE id = ?', args: [layoutId] });
    const id = randomBytes(12).toString('hex'), secret = randomBytes(32).toString('base64url'); const now = Date.now(), expiresAt = now + hours * 3600_000;
    await client.execute({ sql: 'INSERT INTO guest_links (id, layout_id, token_hash, created_at, expires_at, allow_edit, catalog) VALUES (?, ?, ?, ?, ?, 1, ?)', args: [id, layoutId, hashToken(secret), now, expiresAt, JSON.stringify(catalog)] });
    link = { id, secret, createdAt: new Date(now).toISOString(), expiresAt: new Date(expiresAt).toISOString(), revokedAt: null };
    await client.execute('COMMIT');
  } catch (err) { await client.execute('ROLLBACK'); throw err; }
  layoutChanged(layoutId); return link;
}
export async function authorizeLive(layoutId: number, actor: LiveActor): Promise<{ id: string; name: string; catalog: Catalog }> {
  if (actor.role === 'owner') {
    if (!await authService.session(actor.token)) throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Sign in again');
    const link = (await client.execute({ sql: 'SELECT catalog FROM guest_links WHERE layout_id = ? AND allow_edit=1 ORDER BY created_at DESC LIMIT 1', args: [layoutId] })).rows[0];
    return { id: `owner:${hashToken(actor.token)}`, name: 'Organizer', catalog: parseCatalog(link?.catalog) };
  }
  const row = (await client.execute({ sql: `SELECT s.display_name, g.catalog, g.allow_edit FROM guest_sessions s JOIN guest_links g ON s.link_id=g.id
    JOIN layouts l ON l.id=g.layout_id WHERE s.token_hash=? AND g.id=? AND g.layout_id=? AND g.revoked_at IS NULL AND s.expires_at>? AND g.expires_at>?`, args: [hashToken(actor.token), actor.linkId, layoutId, Date.now(), Date.now()] })).rows[0];
  if (!row) throw new GuestAccessClosed();
  if (!Number(row.allow_edit)) throw new AppError(ErrorCodes.FORBIDDEN, 'This invitation allows viewing only');
  return { id: `guest:${hashToken(actor.token)}`, name: String(row.display_name), catalog: parseCatalog(row.catalog) };
}
const presence = new Map<number, Map<string, { name: string; role: 'owner' | 'guest'; connections: number }>>();
export function enterLive(layoutId: number, id: string, name: string, role: 'owner' | 'guest'): () => void {
  const people = presence.get(layoutId) ?? new Map(); const person = people.get(id) ?? { name, role, connections: 0 };
  person.connections++; people.set(id, person); presence.set(layoutId, people); layoutChanged(layoutId);
  return () => { person.connections--; if (!person.connections) people.delete(id); if (!people.size) presence.delete(layoutId); layoutChanged(layoutId); };
}
export function liveSnapshot(layoutId: number, actor: LiveActor, assetId: string): Promise<LiveSnapshot> {
  return layoutWrite(async () => {
    const authorization = await authorizeLive(layoutId, actor); const layout = await layoutRow(layoutId);
    if (!Number(layout.live_guarded)) throw new AppError(ErrorCodes.CONFLICT, 'Start a live collaboration link from Share preview first');
    const bins = await binRows(layoutId);
    return { revision: Number(layout.revision), layout: await getGuestPreview({ layoutId, linkId: assetId, expiresAt: Date.now() + 3600_000 }),
      bins: bins.map(row => {
        const spec = row.custom_spec ? JSON.parse(String(row.custom_spec)) as { height: number; overrides: Record<string, unknown> } : null;
        const customization = parseCustomization(row.customization as string | null);
        const source = row.source_snapshot ? JSON.parse(String(row.source_snapshot)) as { base_model_path?: string } : {};
        return { id: Number(row.id), stableId: String(row.stable_id), customizable: !!(spec || source.base_model_path), height: spec?.height ?? customization?.height ?? 4,
          lipStyle: String(spec?.overrides.lip_style ?? customization?.lipStyle ?? 'normal'), wallPatternEnabled: Boolean(spec?.overrides.wallpattern_enabled ?? customization?.wallPatternEnabled) };
      }),
      catalog: authorization.catalog.items.map(({ key, name, width, depth }) => ({ key, name, width, depth })),
      participants: [...(presence.get(layoutId)?.entries() ?? [])].map(([id, person]) => ({ id: hashToken(id).slice(0, 16), name: person.name, role: person.role })),
    };
  });
}
async function applyChange(layoutId: number, layout: Row, bins: Row[], change: LiveChange, catalog: Catalog): Promise<void> {
  const target = 'stableId' in change ? bins.find(bin => bin.stable_id === change.stableId) : undefined;
  if ('stableId' in change && !target) throw new AppError(ErrorCodes.CONFLICT, 'This bin changed or was removed. Review the current drawer.');
  if (change.type === 'add') {
    const entry = catalog.items.find(item => item.key === change.catalogKey);
    if (!entry) throw new AppError(ErrorCodes.FORBIDDEN, 'Choose a bin from the approved library');
    await client.execute({ sql: `INSERT INTO placed_items(layout_id, library_id, item_id, stable_id, source_snapshot, x, y, width, height, rotation, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`, args: [layoutId, entry.libraryId, entry.itemId, randomUUID(), entry.sourceSnapshot, change.x, change.y, entry.width * 2, entry.depth * 2, Math.max(-1, ...bins.map(bin => Number(bin.sort_order))) + 1] });
  } else if (change.type === 'move') await client.execute({ sql: 'UPDATE placed_items SET x=?, y=? WHERE id=?', args: [change.x, change.y, target!.id] });
  else if (change.type === 'remove') await client.execute({ sql: 'DELETE FROM placed_items WHERE id=?', args: [target!.id] });
  else if (change.type === 'rotate') await client.execute({ sql: 'UPDATE placed_items SET width=height, height=width, rotation=? WHERE id=?', args: [(Number(target!.rotation) + (change.direction === 'cw' ? 90 : 270)) % 360, target!.id] });
  else if (change.type === 'drawer') {
    layout.grid_x = Math.floor(change.widthMm / 42); layout.grid_y = Math.floor(change.depthMm / 42);
    await client.execute({ sql: 'UPDATE layouts SET grid_x=?, grid_y=?, width_mm=?, depth_mm=?, spacer_horizontal=?, spacer_vertical=? WHERE id=?', args: [layout.grid_x, layout.grid_y, change.widthMm, change.depthMm, change.spacerHorizontal, change.spacerVertical, layoutId] });
  } else {
    if (target!.custom_spec) {
      const previous = JSON.parse(String(target!.custom_spec)) as { overrides: Record<string, unknown> };
      const checked = validateCustomBinSpec({ ...previous, height: change.height, overrides: { ...previous.overrides, lip_style: change.lipStyle, wallpattern_enabled: change.wallPatternEnabled } });
      if (!checked.ok) throw invalid(checked.errors.join('; '));
      await client.execute({ sql: 'UPDATE placed_items SET custom_spec=? WHERE id=?', args: [JSON.stringify(checked.spec), target!.id] });
    } else {
      const source = JSON.parse(String(target!.source_snapshot ?? '{}')) as { base_model_path?: string };
      if (!source.base_model_path) throw invalid('This fixed model does not support customization');
      const previous = parseCustomization(target!.customization as string | null) ?? { wallPattern: 'grid', fingerSlide: 'none', wallCutout: { front: false, back: false, left: false, right: false } };
      await client.execute({ sql: 'UPDATE placed_items SET customization=? WHERE id=?', args: [JSON.stringify({ ...previous, height: change.height, lipStyle: change.lipStyle, wallPatternEnabled: change.wallPatternEnabled }), target!.id] });
    }
  }
  validateGeometry(layout, await binRows(layoutId));
}
export function liveCommand(layoutId: number, actor: LiveActor, input: unknown): Promise<{ revision: number; duplicate: boolean }> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return Promise.reject(invalid('Invalid collaboration change'));
  const command: LiveCommand = parsed.data;
  return layoutWrite(async () => {
    await client.execute('BEGIN IMMEDIATE');
    let result: { revision: number; duplicate: boolean };
    try {
      const authorization = await authorizeLive(layoutId, actor); const layout = await layoutRow(layoutId);
      const payloadHash = hashToken(JSON.stringify(command));
      const recorded = (await client.execute({ sql: 'SELECT * FROM live_commands WHERE layout_id=? AND command_id=?', args: [layoutId, command.commandId] })).rows[0];
      if (recorded) {
        if (recorded.actor !== authorization.id || recorded.payload_hash !== payloadHash) throw new AppError(ErrorCodes.CONFLICT, 'This command identifier was already used');
        result = { revision: Number(recorded.revision), duplicate: true };
      } else {
        if (!Number(layout.live_guarded) || command.baseRevision !== Number(layout.revision)) throw new AppError(ErrorCodes.CONFLICT, 'Someone changed this drawer. Review the latest layout and retry your change.');
        await applyChange(layoutId, layout, await binRows(layoutId), command.change, authorization.catalog);
        const revision = Number(layout.revision) + 1;
        await client.execute({ sql: 'UPDATE layouts SET revision=?, updated_at=? WHERE id=?', args: [revision, new Date().toISOString(), layoutId] });
        await client.execute({ sql: 'INSERT INTO live_commands(command_id, layout_id, actor, payload_hash, revision, created_at) VALUES (?, ?, ?, ?, ?, ?)', args: [command.commandId, layoutId, authorization.id, payloadHash, revision, Date.now()] });
        await client.execute({ sql: 'DELETE FROM live_commands WHERE layout_id=? AND revision < ?', args: [layoutId, revision - 1000] });
        result = { revision, duplicate: false };
      }
      await client.execute('COMMIT');
    } catch (err) { await client.execute('ROLLBACK'); throw err; }
    layoutChanged(layoutId);
    // Only accepted changes can prepare renders. Reading guest endpoints cannot.
    void prepareGuestModels(layoutId).catch(() => {});
    return result;
  });
}
