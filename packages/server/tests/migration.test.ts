import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';

// Mock the connection module to use in-memory DB
vi.mock('../src/db/connection.js', async () => {
  const { createClient: cc } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../src/db/schema.js');

  const client = cc({ url: ':memory:' });
  const db = drizzle(client, { schema });

  return { db, client };
});

vi.mock('../src/logger.js', async () => {
  const pino = (await import('pino')).default;
  return { logger: pino({ level: 'silent' }) };
});

const { runMigrations } = await import('../src/db/migrate.js');

describe('DB migrations', () => {
  let client: Client;

  beforeAll(async () => {
    client = createClient({ url: ':memory:' });
    await runMigrations(client);
  });

  afterAll(() => {
    client.close();
  });

  it('does not create shadowboxes table (legacy table dropped)', async () => {
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='shadowboxes'",
    );
    expect(tables.rows).toHaveLength(0);
  });

  it('placed_items does not have shadow_box_id column', async () => {
    const cols = await client.execute('PRAGMA table_info(placed_items)');
    const names = cols.rows.map((r) => (r as Record<string, unknown>).name);
    expect(names).not.toContain('shadow_box_id');
  });

  it('libraries table has base_model_path column', async () => {
    const cols = await client.execute('PRAGMA table_info(libraries)');
    const names = cols.rows.map((r) => (r as Record<string, unknown>).name);
    expect(names).toContain('base_model_path');
  });

  it('library_items table has stl_file column', async () => {
    const cols = await client.execute('PRAGMA table_info(library_items)');
    const names = cols.rows.map((r) => (r as Record<string, unknown>).name);
    expect(names).toContain('stl_file');
  });
});
