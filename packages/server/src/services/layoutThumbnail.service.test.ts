import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

vi.mock('../db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../db/schema.js');
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  return { db, client };
});

vi.mock('../logger.js', async () => {
  const pino = (await import('pino')).default;
  return { logger: pino({ level: 'silent' }) };
});

const mockConfig = vi.hoisted(() => ({ THUMBNAIL_DIR: '' }));
vi.mock('../config.js', () => ({ config: mockConfig }));

import { generate, deleteThumbnail } from './layoutThumbnail.service.js';
import { runMigrations } from '../db/migrate.js';
import { client as testClient } from '../db/connection.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumbnail-svc-'));
  mockConfig.THUMBNAIL_DIR = tmpDir;
  await runMigrations(testClient);

  // Disable FK enforcement so we can insert minimal fixtures
  await testClient.execute('PRAGMA foreign_keys = OFF');
  const now = new Date().toISOString();
  await testClient.execute({
    sql: `INSERT INTO layouts (id, user_id, name, grid_x, grid_y, width_mm, depth_mm, created_at, updated_at)
          VALUES (42, 1, 'test', 4, 4, 168, 168, ?, ?)`,
    args: [now, now],
  });
  await testClient.execute({
    sql: `INSERT INTO libraries (id, name, version, created_at, updated_at) VALUES ('lib1', 'Lib', '1.0.0', ?, ?)`,
    args: [now, now],
  });
  await testClient.execute({
    sql: `INSERT INTO library_items (library_id, id, name, width_units, height_units, color, created_at, updated_at)
          VALUES ('lib1', 'item1', 'Item', 2, 1, '#AA0000', ?, ?)`,
    args: [now, now],
  });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  await testClient.execute('DELETE FROM library_items');
  await testClient.execute('DELETE FROM libraries');
  await testClient.execute('DELETE FROM layouts');
});

describe('generate', () => {
  it('writes <layoutId>.svg to THUMBNAIL_DIR', async () => {
    await generate(42, 4, 4, [{ libraryId: 'lib1', itemId: 'item1', x: 0, y: 0, width: 2, height: 1, rotation: 0 }]);
    const filePath = path.join(tmpDir, '42.svg');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('<svg');
    expect(content).toContain('viewBox="0 0 38 38"'); // 4*8+6=38
  });

  it('sets thumbnail_path on the layout row', async () => {
    await generate(42, 4, 4, []);
    const rows = await testClient.execute('SELECT thumbnail_path FROM layouts WHERE id = 42');
    expect(rows.rows[0].thumbnail_path).toBe('42.svg');
  });

  it('overwrites existing file on second call', async () => {
    await generate(42, 4, 4, []);
    await generate(42, 4, 4, [{ libraryId: 'lib1', itemId: 'item1', x: 0, y: 0, width: 1, height: 1, rotation: 0 }]);
    const content = await fs.readFile(path.join(tmpDir, '42.svg'), 'utf-8');
    // Second call includes an item rect with the library item color
    expect(content).toContain('#AA0000');
  });
});

describe('deleteThumbnail', () => {
  it('removes the SVG file', async () => {
    await generate(42, 4, 4, []);
    await deleteThumbnail(42);
    await expect(fs.access(path.join(tmpDir, '42.svg'))).rejects.toThrow();
  });

  it('clears thumbnail_path on the layout row', async () => {
    await generate(42, 4, 4, []);
    await deleteThumbnail(42);
    const rows = await testClient.execute('SELECT thumbnail_path FROM layouts WHERE id = 42');
    expect(rows.rows[0].thumbnail_path).toBeNull();
  });

  it('is idempotent — no error when file does not exist', async () => {
    await expect(deleteThumbnail(42)).resolves.toBeUndefined();
  });
});
