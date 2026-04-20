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
    filePath: 'ref-lib/test-image.png',
    sizeBytes: 2048,
  }),
  deleteImage: vi.fn().mockResolvedValue(2048),
}));

// Import after mocks
const { createApp } = await import('../src/app.js');
const { client: testClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

describe('Ref image library endpoints', () => {
  let app: ReturnType<typeof createApp>;
  let userToken: string;
  let user2Token: string;
  let adminToken: string;

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
        email: 'reflib-user@example.com',
        username: 'reflibuser',
        password: 'password123',
      });
    userToken = res1.body.data.accessToken;

    // Register user 2
    const res2 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'reflib-user2@example.com',
        username: 'reflibuser2',
        password: 'password123',
      });
    user2Token = res2.body.data.accessToken;

    // Register admin user and promote via direct DB update
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'reflib-admin@example.com',
        username: 'reflibadmin',
        password: 'password123',
      });
    // Promote to admin via raw SQL
    await testClient.execute({
      sql: `UPDATE users SET role = 'admin' WHERE username = 'reflibadmin'`,
      args: [],
    });
    // Re-login to get a token with admin role
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'reflib-admin@example.com',
        password: 'password123',
      });
    adminToken = adminLogin.body.data.accessToken;
  });

  afterAll(() => {
    testClient.close();
  });

  describe('POST /api/v1/ref-images', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/v1/ref-images')
        .attach('image', pngBuffer, 'test.png');

      expect(res.status).toBe(401);
    });

    it('uploads a personal ref image', async () => {
      const res = await request(app)
        .post('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('image', pngBuffer, 'my-ref.png');

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('my-ref.png');
      expect(res.body.data.isGlobal).toBe(false);
      expect(res.body.data.imageUrl).toContain('ref-lib/');
      expect(res.body.data.fileSize).toBe(2048);
      expect(res.body.data.ownerId).toBeTypeOf('number');
    });

    it('rejects upload without a file', async () => {
      const res = await request(app)
        .post('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/ref-images/global', () => {
    it('requires admin role', async () => {
      const res = await request(app)
        .post('/api/v1/ref-images/global')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('image', pngBuffer, 'global.png');

      expect(res.status).toBe(403);
    });

    it('uploads a global ref image as admin', async () => {
      const res = await request(app)
        .post('/api/v1/ref-images/global')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', pngBuffer, 'shared-ref.png');

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('shared-ref.png');
      expect(res.body.data.isGlobal).toBe(true);
      expect(res.body.data.ownerId).toBe(null);
    });
  });

  describe('GET /api/v1/ref-images', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .get('/api/v1/ref-images');

      expect(res.status).toBe(401);
    });

    it('returns user personal images and global images', async () => {
      const res = await request(app)
        .get('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      const images = res.body.data;
      expect(Array.isArray(images)).toBe(true);

      // Should have user1's personal image + global image
      const personalImages = images.filter((img: { isGlobal: boolean }) => !img.isGlobal);
      const globalImages = images.filter((img: { isGlobal: boolean }) => img.isGlobal);
      expect(personalImages.length).toBeGreaterThanOrEqual(1);
      expect(globalImages.length).toBeGreaterThanOrEqual(1);
    });

    it('does not show other users personal images', async () => {
      const res = await request(app)
        .get('/api/v1/ref-images')
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(200);
      const images = res.body.data;

      // User2 should see global images but not user1's personal images
      const personalImages = images.filter((img: { isGlobal: boolean }) => !img.isGlobal);
      // User2 has no personal images
      expect(personalImages.length).toBe(0);
    });
  });

  describe('PATCH /api/v1/ref-images/:id', () => {
    it('renames own image', async () => {
      // Get user1's images to find an ID
      const listRes = await request(app)
        .get('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`);

      const personalImage = listRes.body.data.find((img: { isGlobal: boolean }) => !img.isGlobal);
      expect(personalImage).toBeDefined();

      const res = await request(app)
        .patch(`/api/v1/ref-images/${personalImage.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'renamed-ref.png' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('renamed-ref.png');
    });

    it('prevents renaming other users image', async () => {
      const listRes = await request(app)
        .get('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`);

      const personalImage = listRes.body.data.find((img: { isGlobal: boolean }) => !img.isGlobal);

      const res = await request(app)
        .patch(`/api/v1/ref-images/${personalImage.id}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ name: 'hacked.png' });

      expect(res.status).toBe(403);
    });

    it('allows admin to rename any image', async () => {
      const listRes = await request(app)
        .get('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`);

      const personalImage = listRes.body.data.find((img: { isGlobal: boolean }) => !img.isGlobal);

      const res = await request(app)
        .patch(`/api/v1/ref-images/${personalImage.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'admin-renamed.png' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('admin-renamed.png');
    });
  });

  describe('DELETE /api/v1/ref-images/:id', () => {
    it('prevents deleting other users image', async () => {
      const listRes = await request(app)
        .get('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`);

      const personalImage = listRes.body.data.find((img: { isGlobal: boolean }) => !img.isGlobal);

      const res = await request(app)
        .delete(`/api/v1/ref-images/${personalImage.id}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(403);
    });

    it('prevents regular user from deleting global image', async () => {
      const listRes = await request(app)
        .get('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`);

      const globalImage = listRes.body.data.find((img: { isGlobal: boolean }) => img.isGlobal);

      const res = await request(app)
        .delete(`/api/v1/ref-images/${globalImage.id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('deletes own image', async () => {
      // Upload a new image to delete
      const uploadRes = await request(app)
        .post('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('image', pngBuffer, 'to-delete.png');

      const imageId = uploadRes.body.data.id;

      const res = await request(app)
        .delete(`/api/v1/ref-images/${imageId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(204);

      // Verify it's gone
      const listRes = await request(app)
        .get('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`);

      const found = listRes.body.data.find((img: { id: number }) => img.id === imageId);
      expect(found).toBeUndefined();
    });

    it('allows admin to delete global image', async () => {
      // Upload a global image to delete
      const uploadRes = await request(app)
        .post('/api/v1/ref-images/global')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', pngBuffer, 'global-to-delete.png');

      const imageId = uploadRes.body.data.id;

      const res = await request(app)
        .delete(`/api/v1/ref-images/${imageId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
    });

    it('returns 404 for non-existent image', async () => {
      const res = await request(app)
        .delete('/api/v1/ref-images/99999')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });
  });
});
