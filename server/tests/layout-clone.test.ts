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

// Mock image service
vi.mock('../src/services/image.service.js', () => ({
  processAndSaveImage: vi.fn().mockResolvedValue({
    filePath: 'ref-lib/test-image.png',
    sizeBytes: 2048,
  }),
  deleteImage: vi.fn().mockResolvedValue(2048),
}));

// Mock thumbnail service so tests don't need a real THUMBNAIL_DIR on disk
vi.mock('../src/services/layoutThumbnail.service.js', () => ({
  generate: vi.fn().mockResolvedValue(undefined),
  deleteThumbnail: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
const { createApp } = await import('../src/app.js');
const { client: testClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

describe('Layout clone endpoint', () => {
  let app: ReturnType<typeof createApp>;
  let userToken: string;
  let user2Token: string;
  let adminToken: string;

  beforeAll(async () => {
    await runMigrations(testClient);
    app = createApp();

    // Register users
    const res1 = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'clone-user@example.com', username: 'cloneuser', password: 'password123' });
    userToken = res1.body.data.accessToken;

    const res2 = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'clone-user2@example.com', username: 'cloneuser2', password: 'password123' });
    user2Token = res2.body.data.accessToken;

    // Register and promote admin
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'clone-admin@example.com', username: 'cloneadmin', password: 'password123' });

    await testClient.execute({
      sql: "UPDATE users SET role = 'admin' WHERE username = 'cloneadmin'",
      args: [],
    });

    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'clone-admin@example.com', password: 'password123' });
    adminToken = adminLoginRes.body.data.accessToken;
  });

  afterAll(() => {
    testClient.close();
  });

  async function createLayout(token: string, name = 'Clone Source') {
    const res = await request(app)
      .post('/api/v1/layouts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name,
        description: 'Original layout',
        gridX: 4,
        gridY: 4,
        widthMm: 168,
        depthMm: 168,
        spacerHorizontal: 'one-sided',
        spacerVertical: 'symmetrical',
        placedItems: [
          { itemId: 'bins_standard:bin-1x1', x: 0, y: 0, width: 1, height: 1, rotation: 0 },
          { itemId: 'bins_standard:bin-2x1', x: 1, y: 0, width: 2, height: 1, rotation: 90 },
        ],
      });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  describe('POST /api/v1/layouts/:id/clone', () => {
    it('clones own layout as a new draft', async () => {
      const source = await createLayout(userToken, 'My Layout');

      const res = await request(app)
        .post(`/api/v1/layouts/${source.id}/clone`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Copy of My Layout');
      expect(res.body.data.description).toBe('Original layout');
      expect(res.body.data.id).not.toBe(source.id);
      expect(res.body.data.gridX).toBe(4);
      expect(res.body.data.gridY).toBe(4);
      expect(res.body.data.spacerHorizontal).toBe('one-sided');
      expect(res.body.data.spacerVertical).toBe('symmetrical');
      expect(res.body.data.placedItems).toHaveLength(2);
      expect(res.body.data.placedItems[0].libraryId).toBe('bins_standard');
      expect(res.body.data.placedItems[0].itemId).toBe('bin-1x1');
      expect(res.body.data.placedItems[1].rotation).toBe(90);
    });

    it('admin can clone any layout', async () => {
      const source = await createLayout(userToken, 'User Layout For Admin');

      const res = await request(app)
        .post(`/api/v1/layouts/${source.id}/clone`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Copy of User Layout For Admin');
    });

    it('non-owner non-admin cannot clone', async () => {
      const source = await createLayout(userToken, 'Protected Clone');

      const res = await request(app)
        .post(`/api/v1/layouts/${source.id}/clone`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent layout', async () => {
      const res = await request(app)
        .post('/api/v1/layouts/99999/clone')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/v1/layouts/1/clone');

      expect(res.status).toBe(401);
    });
  });
});
