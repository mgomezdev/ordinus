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

// Mock the image service to avoid filesystem operations
vi.mock('../src/services/image.service.js', () => ({
  processAndSaveImage: vi.fn().mockResolvedValue({
    filePath: 'ref/1/test-image.png',
    sizeBytes: 2048,
  }),
  deleteImage: vi.fn().mockResolvedValue(2048),
}));

// Import after mocks
const { createApp } = await import('../src/app.js');
const { client: testClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

describe('Reference image endpoints', () => {
  let app: ReturnType<typeof createApp>;
  let userToken: string;
  let user2Token: string;
  let layoutId: number;

  // Create a minimal valid PNG buffer (1x1 pixel)
  const pngBuffer = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000a49444154789c626000000002000198e195280000000049454e44ae426082',
    'hex',
  );

  beforeAll(async () => {
    await runMigrations(testClient);
    app = createApp();

    // Register user 1
    const res1 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'refimg-user@example.com',
        username: 'refimguser',
        password: 'password123',
      });
    userToken = res1.body.data.accessToken;

    // Register user 2
    const res2 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'refimg-user2@example.com',
        username: 'refimguser2',
        password: 'password123',
      });
    user2Token = res2.body.data.accessToken;

    // Create a layout for user 1
    const layoutRes = await request(app)
      .post('/api/v1/layouts')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Reference Image Test Layout',
        gridX: 4,
        gridY: 4,
        widthMm: 168,
        depthMm: 168,
        placedItems: [],
      });
    layoutId = layoutRes.body.data.id;
  });

  afterAll(() => {
    testClient.close();
  });

  describe('POST /api/v1/layouts/:id/reference-images', () => {
    it('uploads a reference image to own layout', async () => {
      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/reference-images`)
        .set('Authorization', `Bearer ${userToken}`)
        .attach('image', pngBuffer, 'test-ref.png');

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('test-ref.png');
      expect(res.body.data.layoutId).toBe(layoutId);
      expect(res.body.data.filePath).toBeDefined();
      expect(res.body.data.x).toBe(10);
      expect(res.body.data.y).toBe(10);
      expect(res.body.data.opacity).toBe(0.5);
      expect(res.body.data.scale).toBe(1.0);
      expect(res.body.data.isLocked).toBe(false);
      expect(res.body.data.rotation).toBe(0);
    });

    it('returns 403 for non-owner', async () => {
      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/reference-images`)
        .set('Authorization', `Bearer ${user2Token}`)
        .attach('image', pngBuffer, 'test-ref.png');

      expect(res.status).toBe(403);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/reference-images`)
        .attach('image', pngBuffer, 'test-ref.png');

      expect(res.status).toBe(401);
    });

    it('returns 404 for non-existent layout', async () => {
      const res = await request(app)
        .post('/api/v1/layouts/99999/reference-images')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('image', pngBuffer, 'test-ref.png');

      expect(res.status).toBe(404);
    });

    it('returns 400 without file', async () => {
      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/reference-images`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
    });

    it('includes reference images in layout detail', async () => {
      const res = await request(app)
        .get(`/api/v1/layouts/${layoutId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.referenceImages).toBeDefined();
      expect(res.body.data.referenceImages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DELETE /api/v1/layouts/:id/reference-images/:imgId', () => {
    let imageId: number;

    beforeAll(async () => {
      // Upload an image to delete
      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/reference-images`)
        .set('Authorization', `Bearer ${userToken}`)
        .attach('image', pngBuffer, 'delete-me.png');
      imageId = res.body.data.id;
    });

    it('deletes a reference image', async () => {
      const res = await request(app)
        .delete(`/api/v1/layouts/${layoutId}/reference-images/${imageId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(204);
    });

    it('returns 404 for already deleted image', async () => {
      const res = await request(app)
        .delete(`/api/v1/layouts/${layoutId}/reference-images/${imageId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 for non-owner', async () => {
      // Upload another image first
      const uploadRes = await request(app)
        .post(`/api/v1/layouts/${layoutId}/reference-images`)
        .set('Authorization', `Bearer ${userToken}`)
        .attach('image', pngBuffer, 'protected.png');
      const protectedImageId = uploadRes.body.data.id;

      const res = await request(app)
        .delete(`/api/v1/layouts/${layoutId}/reference-images/${protectedImageId}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent layout', async () => {
      const res = await request(app)
        .delete('/api/v1/layouts/99999/reference-images/1')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Image quota enforcement', () => {
    it('rejects upload when quota exceeded', async () => {
      // Set the user's storage to be very close to the limit
      await testClient.execute({
        sql: `UPDATE user_storage SET image_bytes = max_image_bytes - 1 WHERE user_id = (SELECT id FROM users WHERE email = ?)`,
        args: ['refimg-user@example.com'],
      });

      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/reference-images`)
        .set('Authorization', `Bearer ${userToken}`)
        .attach('image', pngBuffer, 'quota-test.png');

      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('QUOTA_EXCEEDED');

      // Reset storage for other tests
      await testClient.execute({
        sql: `UPDATE user_storage SET image_bytes = 0 WHERE user_id = (SELECT id FROM users WHERE email = ?)`,
        args: ['refimg-user@example.com'],
      });
    });
  });
});
