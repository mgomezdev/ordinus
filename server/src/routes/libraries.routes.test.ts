import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

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

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../middleware/admin.js', () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../services/image.service.js', () => ({
  saveItemImage: vi.fn(),
}));

import librariesRoutes from './libraries.routes.js';

const { runMigrations } = await import('../db/migrate.js');
const { client: testClient } = await import('../db/connection.js');

const TEST_LIBRARY_ID = 'lib-paramhash-test';
const TEST_ITEM_ID = 'item-with-hash';
const EXPECTED_PARAM_HASH = 'abc123def456';

beforeAll(async () => {
  await runMigrations(testClient);

  const now = new Date().toISOString();

  await testClient.execute({
    sql: `INSERT OR IGNORE INTO libraries
            (id, name, version, is_active, sort_order, created_at, updated_at)
          VALUES (?, ?, '1.0.0', 1, 0, ?, ?)`,
    args: [TEST_LIBRARY_ID, 'Param Hash Test Library', now, now],
  });

  await testClient.execute({
    sql: `INSERT OR IGNORE INTO library_items
            (library_id, id, name, width_units, height_units, color,
             is_active, sort_order, param_hash, created_at, updated_at)
          VALUES (?, ?, ?, 2, 3, '#000000', 1, 0, ?, ?, ?)`,
    args: [TEST_LIBRARY_ID, TEST_ITEM_ID, 'Test Item', EXPECTED_PARAM_HASH, now, now],
  });
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/libraries', librariesRoutes);
  return app;
}

describe('GET /libraries/:libraryId/items — paramHash', () => {
  it('includes paramHash in each returned item', async () => {
    const app = makeApp();
    const res = await request(app).get(`/libraries/${TEST_LIBRARY_ID}/items`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const item = res.body.data.find(
      (i: { id: string }) => i.id === TEST_ITEM_ID,
    );
    expect(item).toBeDefined();
    expect(item.paramHash).toBe(EXPECTED_PARAM_HASH);
  });

  it('returns null paramHash when no hash is stored', async () => {
    const now = new Date().toISOString();
    await testClient.execute({
      sql: `INSERT OR IGNORE INTO library_items
              (library_id, id, name, width_units, height_units, color,
               is_active, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, 1, 1, '#ffffff', 1, 1, ?, ?)`,
      args: [TEST_LIBRARY_ID, 'item-no-hash', 'No Hash Item', now, now],
    });

    const app = makeApp();
    const res = await request(app).get(`/libraries/${TEST_LIBRARY_ID}/items`);

    expect(res.status).toBe(200);
    const noHashItem = res.body.data.find(
      (i: { id: string }) => i.id === 'item-no-hash',
    );
    expect(noHashItem).toBeDefined();
    expect(noHashItem.paramHash).toBeNull();
  });
});
