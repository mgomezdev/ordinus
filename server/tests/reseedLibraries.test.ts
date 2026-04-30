import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import pino from 'pino';

// Mock node:fs — we verify DB state, not file ops
vi.mock('node:fs', () => ({
  readFileSync: vi.fn((filePath: string) => {
    if (String(filePath).includes('manifest.json')) {
      return JSON.stringify({
        version: '1.0.0',
        libraries: [
          { id: 'test-gen-lib', name: 'Generated Lib', path: '/libraries/test-gen-lib/index.json' },
          { id: 'test-static-lib', name: 'Static Lib', path: '/libraries/test-static-lib/index.json' },
        ],
      });
    }
    if (String(filePath).includes('test-gen-lib')) {
      return JSON.stringify({
        version: '1.0.0',
        baseModel: 'base.scad',
        items: [
          { id: 'item-1', name: 'Item 1', widthUnits: 1, heightUnits: 1, color: '#000', categories: ['bin'] },
        ],
      });
    }
    if (String(filePath).includes('test-static-lib')) {
      return JSON.stringify({
        version: '1.0.0',
        items: [
          { id: 'item-2', name: 'Item 2', widthUnits: 1, heightUnits: 1, color: '#000', categories: ['bin'], stlFile: 'item2.stl' },
        ],
      });
    }
    throw new Error(`Unexpected readFileSync: ${filePath}`);
  }),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
}));

vi.mock('../src/logger.js', async () => {
  const pino = (await import('pino')).default;
  return { logger: pino({ level: 'silent' }) };
});

const { runMigrations } = await import('../src/db/migrate.js');
const { reseedLibraryData } = await import('../src/db/reseedLibraries.js');

describe('reseedLibraryData — base model and static stl', () => {
  let client: Client;

  beforeAll(async () => {
    client = createClient({ url: ':memory:' });
    await runMigrations(client);
    await reseedLibraryData(client, pino({ level: 'silent' }));
  });

  afterAll(() => client.close());

  it('stores base_model_path for library with baseModel', async () => {
    const rows = await client.execute(`SELECT base_model_path FROM libraries WHERE id = 'test-gen-lib'`);
    const modelPath = rows.rows[0]?.base_model_path as string | null;
    expect(modelPath).not.toBeNull();
    expect(modelPath).toContain('base.scad');
  });

  it('stores null base_model_path for library without baseModel', async () => {
    const rows = await client.execute(`SELECT base_model_path FROM libraries WHERE id = 'test-static-lib'`);
    const modelPath = rows.rows[0]?.base_model_path as string | null;
    expect(modelPath).toBeNull();
  });

  it('stores stl_file for item with stlFile', async () => {
    const rows = await client.execute(`SELECT stl_file FROM library_items WHERE library_id = 'test-static-lib' AND id = 'item-2'`);
    const stlFile = rows.rows[0]?.stl_file as string | null;
    expect(stlFile).not.toBeNull();
    expect(stlFile).toContain('item2.stl');
  });

  it('stores null stl_file for item without stlFile', async () => {
    const rows = await client.execute(`SELECT stl_file FROM library_items WHERE library_id = 'test-gen-lib' AND id = 'item-1'`);
    const stlFile = rows.rows[0]?.stl_file as string | null;
    expect(stlFile).toBeNull();
  });
});
