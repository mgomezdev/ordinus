import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

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

const mockConfig = vi.hoisted(() => ({ THUMBNAIL_DIR: '', JWT_SECRET: 'test-secret' }));
vi.mock('../config.js', () => ({ config: mockConfig }));

vi.mock('../middleware/rateLimiter.js', () => ({
  generalLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import thumbnailsRoutes from './thumbnails.routes.js';
import { runMigrations } from '../db/migrate.js';
import { client as testClient } from '../db/connection.js';
import { errorHandler } from '../middleware/errorHandler.js';

let tmpDir: string;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/thumbnails', thumbnailsRoutes);
  app.use(errorHandler);
  return app;
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumbnail-route-'));
  mockConfig.THUMBNAIL_DIR = tmpDir;
  await runMigrations(testClient);
  await testClient.execute('PRAGMA foreign_keys = OFF');
  const now = new Date().toISOString();
  // Layout 1 has a thumbnail
  await testClient.execute({
    sql: `INSERT INTO layouts (id, user_id, name, grid_x, grid_y, width_mm, depth_mm, thumbnail_path, created_at, updated_at)
          VALUES (1, 1, 'test', 4, 4, 168, 168, '1.svg', ?, ?)`,
    args: [now, now],
  });
  // Layout 2 has no thumbnail
  await testClient.execute({
    sql: `INSERT INTO layouts (id, user_id, name, grid_x, grid_y, width_mm, depth_mm, created_at, updated_at)
          VALUES (2, 2, 'test2', 2, 2, 84, 84, ?, ?)`,
    args: [now, now],
  });
  // Write the SVG file for layout 1
  await fs.writeFile(path.join(tmpDir, '1.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 38"></svg>', 'utf-8');
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('GET /thumbnails/:layoutId', () => {
  it('serves SVG without authentication', async () => {
    const app = makeApp();
    const res = await request(app).get('/thumbnails/1').buffer(true).parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks).toString('utf-8')));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/svg/);
    expect(res.body as string).toContain('<svg');
  });

  it('returns 404 when layout has no thumbnail_path', async () => {
    const app = makeApp();
    const res = await request(app).get('/thumbnails/2');
    expect(res.status).toBe(404);
  });

  it('returns 404 when layout does not exist', async () => {
    const app = makeApp();
    const res = await request(app).get('/thumbnails/999');
    expect(res.status).toBe(404);
  });

  it('returns 400 when thumbnail_path contains a traversal sequence', async () => {
    // Insert a layout with a malicious thumbnail_path
    const now = new Date().toISOString();
    await testClient.execute({
      sql: `INSERT INTO layouts (id, user_id, name, grid_x, grid_y, width_mm, depth_mm, thumbnail_path, created_at, updated_at)
            VALUES (99, 1, 'evil', 4, 4, 168, 168, '../evil.svg', ?, ?)`,
      args: [now, now],
    });
    const app = makeApp();
    const res = await request(app).get('/thumbnails/99');
    expect(res.status).toBe(400);
  });
});
