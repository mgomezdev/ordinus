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

vi.mock('../services/generationPipeline.service.js', () => ({
  generationPipeline: {
    enqueue: vi.fn().mockResolvedValue('pending'),
    getStatus: vi.fn().mockResolvedValue('not-found'),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import generationRoutes from './generation.routes.js';
import { generationPipeline } from '../services/generationPipeline.service.js';
const mockPipeline = vi.mocked(generationPipeline);

const { runMigrations } = await import('../db/migrate.js');
const { client: testClient } = await import('../db/connection.js');

beforeAll(async () => {
  await runMigrations(testClient);
  // Seed library + item
  const now = new Date().toISOString();
  await testClient.execute({
    sql: `INSERT OR IGNORE INTO libraries (id, name, version, is_active, sort_order, created_at, updated_at, base_model_path)
          VALUES (?, ?, '1.0.0', 1, 0, ?, ?, ?)`,
    args: ['test-lib', 'Test Library', now, now, '/fake/base.scad'],
  });
  await testClient.execute({
    sql: `INSERT OR IGNORE INTO library_items (library_id, id, name, width_units, height_units, color, is_active, sort_order, created_at, updated_at)
          VALUES (?, ?, 'Item', 2, 3, '#000', 1, 0, ?, ?)`,
    args: ['test-lib', 'item-1', now, now],
  });
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/generation', generationRoutes);
  return app;
}

describe('POST /generation/generate', () => {
  it('returns 400 for missing body fields', async () => {
    const app = makeApp();
    const res = await request(app).post('/generation/generate').send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown library item', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/generation/generate')
      .send({ libraryId: 'no-lib', itemId: 'no-item' });
    expect(res.status).toBe(404);
  });

  it('enqueues and returns hash + pending status', async () => {
    const app = makeApp();
    mockPipeline.enqueue.mockResolvedValue('pending');
    const res = await request(app)
      .post('/generation/generate')
      .send({ libraryId: 'test-lib', itemId: 'item-1' });
    expect(res.status).toBe(200);
    expect(res.body.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.status).toBe('pending');
  });

  it('returns complete immediately if already cached', async () => {
    const app = makeApp();
    mockPipeline.enqueue.mockResolvedValue('complete');
    const res = await request(app)
      .post('/generation/generate')
      .send({ libraryId: 'test-lib', itemId: 'item-1' });
    expect(res.body.status).toBe('complete');
  });
});

describe('GET /generation/status/:hash', () => {
  it('returns status from pipeline', async () => {
    const app = makeApp();
    mockPipeline.getStatus.mockResolvedValue('complete');
    const res = await request(app).get('/generation/status/abc123');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hash: 'abc123', status: 'complete' });
  });

  it('returns 400 for hash containing path traversal', async () => {
    const app = makeApp();
    const res = await request(app).get('/generation/status/..%2Fsomething');
    expect(res.status).toBe(400);
  });
});

describe('GET /generation/image/:hash/:filename', () => {
  it('returns 400 for invalid filename', async () => {
    const app = makeApp();
    const res = await request(app).get('/generation/image/abc123/invalid.jpg');
    expect(res.status).toBe(400);
  });

  it('returns 400 for filename not in allowed set', async () => {
    const app = makeApp();
    const res = await request(app).get('/generation/image/abc123/malicious.php');
    expect(res.status).toBe(400);
  });

  it('returns 400 for hash containing path traversal', async () => {
    const app = makeApp();
    const res = await request(app).get('/generation/image/..%2F..%2Fetc/ortho.png');
    expect(res.status).toBe(400);
  });

  it('returns 404 when image file does not exist', async () => {
    const app = makeApp();
    const res = await request(app).get('/generation/image/nonexistenthash/ortho.png');
    expect(res.status).toBe(404);
  });
});

describe('GET /generation/stl/:hash', () => {
  it('returns 400 for hash containing path traversal', async () => {
    const app = makeApp();
    const res = await request(app).get('/generation/stl/..%2F..%2Fetc');
    expect(res.status).toBe(400);
  });

  it('returns 404 when STL file does not exist', async () => {
    const app = makeApp();
    const res = await request(app).get('/generation/stl/nonexistenthash');
    expect(res.status).toBe(404);
  });
});
