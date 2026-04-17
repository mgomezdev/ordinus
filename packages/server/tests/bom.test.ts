import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';

// Mock the connection module to use in-memory DB
vi.mock('../src/db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../src/db/schema.js');

  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });

  return { db, client };
});

// Mock the logger with a real pino instance (silent) so pino-http works
vi.mock('../src/logger.js', () => ({
  logger: pino({ level: 'silent' }),
}));

// Import after mocks
const { createApp } = await import('../src/app.js');
const { client: testClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

describe('BOM endpoints', () => {
  let app: ReturnType<typeof createApp>;
  let accessToken: string;

  const sampleExportJson = JSON.stringify({
    version: '1.0.0',
    grid: { gridX: 4, gridY: 4 },
    items: [{ itemId: 'bin-1x1', name: 'Small Bin', x: 0, y: 0, width: 1, height: 1 }],
    bom: [{ itemId: 'bin-1x1', name: 'Small Bin', quantity: 3 }],
  });

  beforeAll(async () => {
    await runMigrations(testClient);
    app = createApp();

    // Register a user
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'bom-user@example.com',
        username: 'bomuser',
        password: 'password123',
      });
    accessToken = res.body.data.accessToken;
  });

  afterAll(() => {
    testClient.close();
  });

  describe('POST /api/v1/bom/submit', () => {
    it('submits a BOM with authentication', async () => {
      const res = await request(app)
        .post('/api/v1/bom/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          gridX: 4,
          gridY: 4,
          widthMm: 168,
          depthMm: 168,
          totalItems: 5,
          totalUnique: 3,
          exportJson: sampleExportJson,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.gridX).toBe(4);
      expect(res.body.data.gridY).toBe(4);
      expect(res.body.data.widthMm).toBe(168);
      expect(res.body.data.depthMm).toBe(168);
      expect(res.body.data.totalItems).toBe(5);
      expect(res.body.data.totalUnique).toBe(3);
      expect(res.body.data.userId).toBeDefined();
      expect(res.body.data.createdAt).toBeDefined();
    });

    it('submits a BOM without authentication (anonymous)', async () => {
      const res = await request(app)
        .post('/api/v1/bom/submit')
        .send({
          gridX: 2,
          gridY: 3,
          widthMm: 84,
          depthMm: 126,
          totalItems: 2,
          totalUnique: 1,
          exportJson: sampleExportJson,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.userId).toBeNull();
      expect(res.body.data.gridX).toBe(2);
      expect(res.body.data.gridY).toBe(3);
    });

    it('submits a BOM with optional layoutId', async () => {
      // Create a layout first
      const layoutRes = await request(app)
        .post('/api/v1/layouts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'BOM Layout',
          gridX: 4,
          gridY: 4,
          widthMm: 168,
          depthMm: 168,
          placedItems: [],
        });
      const layoutId = layoutRes.body.data.id;

      const res = await request(app)
        .post('/api/v1/bom/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          layoutId,
          gridX: 4,
          gridY: 4,
          widthMm: 168,
          depthMm: 168,
          totalItems: 0,
          totalUnique: 0,
          exportJson: sampleExportJson,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.layoutId).toBe(layoutId);
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/v1/bom/submit')
        .send({
          gridX: 4,
          // missing gridY, widthMm, depthMm, etc.
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates gridX and gridY range', async () => {
      const res = await request(app)
        .post('/api/v1/bom/submit')
        .send({
          gridX: 0,
          gridY: 25,
          widthMm: 168,
          depthMm: 168,
          totalItems: 1,
          totalUnique: 1,
          exportJson: sampleExportJson,
        });

      expect(res.status).toBe(400);
    });

    it('validates exportJson is not empty', async () => {
      const res = await request(app)
        .post('/api/v1/bom/submit')
        .send({
          gridX: 4,
          gridY: 4,
          widthMm: 168,
          depthMm: 168,
          totalItems: 1,
          totalUnique: 1,
          exportJson: '',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/bom/:id/download', () => {
    let bomId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/bom/submit')
        .send({
          gridX: 4,
          gridY: 4,
          widthMm: 168,
          depthMm: 168,
          totalItems: 3,
          totalUnique: 2,
          exportJson: sampleExportJson,
        });
      bomId = res.body.data.id;
    });

    it('downloads BOM JSON by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/bom/${bomId}/download`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['content-disposition']).toContain(`bom-${bomId}.json`);

      const body = JSON.parse(res.text);
      expect(body.version).toBe('1.0.0');
      expect(body.grid.gridX).toBe(4);
    });

    it('returns 404 for non-existent BOM', async () => {
      const res = await request(app)
        .get('/api/v1/bom/99999/download')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid ID', async () => {
      const res = await request(app)
        .get('/api/v1/bom/abc/download')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
    });
  });
});
