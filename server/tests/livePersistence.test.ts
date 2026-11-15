import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pino from 'pino';

const { directory, dbPath } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('node:os') as typeof import('node:os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'ordinus-live-persistence-'));
  return { directory, dbPath: join(directory, 'test.db') };
});
vi.mock('../src/config.js', async () => {
  const { config } = await vi.importActual<typeof import('../src/config.js')>('../src/config.js');
  return { config: { ...config, DB_PATH: dbPath } };
});
vi.mock('../src/logger.js', () => ({ logger: pino({ level: 'silent' }) }));
vi.mock('../src/services/layoutThumbnail.service.js', () => ({ generate: vi.fn(), deleteThumbnail: vi.fn() }));
vi.mock('../src/services/generationPipeline.service.js', () => ({ generationPipeline: { enqueue: vi.fn(async () => 'pending') } }));

let connections = await import('../src/db/connection.js');
let layouts = await import('../src/services/layout.service.js');
let live = await import('../src/services/live.service.js');
let ownerToken: string;
const data = { name: 'Persistent drawer', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168,
  placedItems: [{ itemId: 'persistent:original', x: 0, y: 0, width: 2, height: 2, rotation: 0 }] };
beforeAll(async () => {
  const { runMigrations } = await import('../src/db/migrate.js');
  const { provisionAdmin, authService } = await import('../src/services/auth.service.js');
  await runMigrations(connections.client);
  await provisionAdmin('persistent-test-password');
  ownerToken = await authService.login('admin', 'persistent-test-password');
  await connections.client.execute("INSERT INTO libraries(id, name) VALUES ('persistent', 'Persistent bins')");
  await connections.client.execute("INSERT INTO library_items(library_id, id, name, width_units, height_units, image_path) VALUES ('persistent', 'original', 'Original', 1, 1, 'original.png'), ('persistent', 'new', 'New', 1, 1, 'new.png')");
});
function close() { connections.client.close(); connections.authClient.close(); connections.liveClient.close(); }
afterAll(async () => {
  close();
  // Native Windows handles can outlive close until the worker exits.
  if (process.platform !== 'win32') await rm(directory, { recursive: true, force: true });
});

it('freezes newly added and replaced workspace models on the transaction connection', async () => {
  const layout = await layouts.createLayout(data);
  await live.createEditableLink(layout.id, 1, ['persistent']);
  const shared = await layouts.getLayoutById(layout.id);
  const replacedId = shared.placedItems[0].stableId!;
  const addedId = randomUUID();
  await layouts.updateLayout(layout.id, { ...data, baseRevision: shared.revision, placedItems: [
    { ...data.placedItems[0], stableId: replacedId, itemId: 'persistent:new' },
    { ...data.placedItems[0], stableId: addedId, itemId: 'persistent:new', x: 2 },
  ] });
  const stored = await connections.authClient.execute({ sql: 'SELECT source_snapshot FROM placed_items WHERE layout_id=? ORDER BY sort_order', args: [layout.id] });
  expect(stored.rows).toHaveLength(2);
  for (const row of stored.rows) expect(JSON.parse(String(row.source_snapshot))).toMatchObject({ image_path: 'new.png' });
  await connections.authClient.execute("UPDATE library_items SET image_path='changed.png' WHERE library_id='persistent' AND id='new'");
  const current = await layouts.getLayoutById(layout.id);
  await layouts.updateLayout(layout.id, { ...data, baseRevision: current.revision, placedItems: current.placedItems.map(bin => ({ ...bin, itemId: `${bin.libraryId}:${bin.itemId}`, x: bin.x + 2 })) });
  const saved = await connections.authClient.execute({ sql: 'SELECT source_snapshot FROM placed_items WHERE layout_id=? ORDER BY sort_order', args: [layout.id] });
  expect(saved.rows).toEqual(stored.rows);
});

it('retains guest authority, revisions and command receipts after all connections and services restart', async () => {
  const layout = await layouts.createLayout(data);
  const link = await live.createEditableLink(layout.id, 1, ['persistent']);
  const { hashToken } = await import('../src/services/auth.service.js');
  const token = 'restart-guest-token';
  await connections.authClient.execute({ sql: 'INSERT INTO guest_sessions(token_hash, link_id, expires_at, display_name) VALUES (?, ?, ?, ?)', args: [hashToken(token), link.id, Date.now() + 3600_000, 'Returning guest'] });
  const actor = { role: 'guest' as const, token, linkId: link.id };
  const before = await live.liveSnapshot(layout.id, actor, link.id);
  const command = { commandId: randomUUID(), baseRevision: before.revision, change: { type: 'move', stableId: before.bins[0].stableId, x: 2, y: 2 } };
  const accepted = await live.liveCommand(layout.id, actor, command);
  close(); vi.resetModules();
  connections = await import('../src/db/connection.js');
  layouts = await import('../src/services/layout.service.js');
  live = await import('../src/services/live.service.js');
  expect(await live.liveCommand(layout.id, actor, command)).toEqual({ ...accepted, duplicate: true });
  const restored = await live.liveSnapshot(layout.id, actor, link.id);
  expect(restored.revision).toBe(before.revision + 1);
  expect(restored.layout.bins[0]).toMatchObject({ x: 2, y: 2 });
  expect(restored.bins[0].stableId).toBe(before.bins[0].stableId);
  await expect(live.liveCommand(layout.id, { role: 'owner', token: ownerToken }, command)).rejects.toThrow('identifier was already used');
  await expect(live.liveCommand(layout.id, actor, { ...command, commandId: randomUUID() })).rejects.toThrow('Someone changed');
});
