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
    filePath: 'test-lib/test-item.png',
    sizeBytes: 1024,
  }),
  deleteImage: vi.fn().mockResolvedValue(0),
}));

// Import after mocks
const { createApp } = await import('../src/app.js');
const { client: testClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

describe('Admin endpoints', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    await runMigrations(testClient);
    app = createApp();

    // Register a regular user
    const userRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'regular@example.com',
        username: 'regularuser',
        password: 'password123',
      });
    userToken = userRes.body.data.accessToken;

    // Register an admin user
    const adminRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'admin@example.com',
        username: 'adminuser',
        password: 'password123',
      });
    adminToken = adminRes.body.data.accessToken;

    // Promote user to admin directly in DB
    await testClient.execute({
      sql: `UPDATE users SET role = 'admin' WHERE email = ?`,
      args: ['admin@example.com'],
    });

    // Re-login to get token with admin role
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password123',
      });
    adminToken = loginRes.body.data.accessToken;

    // Seed a category for item tests
    await testClient.execute({
      sql: `INSERT INTO categories (id, name, color, sort_order) VALUES (?, ?, ?, ?)`,
      args: ['bin', 'Bin', '#3B82F6', 0],
    });
    await testClient.execute({
      sql: `INSERT INTO categories (id, name, color, sort_order) VALUES (?, ?, ?, ?)`,
      args: ['labeled', 'Labeled', '#8B5CF6', 1],
    });
  });

  afterAll(() => {
    testClient.close();
  });

  describe('POST /api/v1/libraries (create library)', () => {
    it('creates a library as admin', async () => {
      const res = await request(app)
        .post('/api/v1/libraries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: 'test-lib',
          name: 'Test Library',
          description: 'A test library',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('test-lib');
      expect(res.body.data.name).toBe('Test Library');
      expect(res.body.data.description).toBe('A test library');
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.itemCount).toBe(0);
    });

    it('returns 403 for regular user', async () => {
      const res = await request(app)
        .post('/api/v1/libraries')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          id: 'forbidden-lib',
          name: 'Forbidden Library',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/libraries')
        .send({
          id: 'unauth-lib',
          name: 'Unauth Library',
        });

      expect(res.status).toBe(401);
    });

    it('returns 409 for duplicate library ID', async () => {
      const res = await request(app)
        .post('/api/v1/libraries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: 'test-lib',
          name: 'Duplicate Library',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/v1/libraries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Missing ID',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates ID format', async () => {
      const res = await request(app)
        .post('/api/v1/libraries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: 'Invalid ID With Spaces',
          name: 'Bad ID Library',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/v1/libraries/:id (update library)', () => {
    it('updates a library as admin', async () => {
      const res = await request(app)
        .patch('/api/v1/libraries/test-lib')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Library',
          description: 'Updated description',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Library');
      expect(res.body.data.description).toBe('Updated description');
    });

    it('returns 403 for regular user', async () => {
      const res = await request(app)
        .patch('/api/v1/libraries/test-lib')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Hijacked',
        });

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent library', async () => {
      const res = await request(app)
        .patch('/api/v1/libraries/non-existent')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Ghost Library',
        });

      expect(res.status).toBe(404);
    });

    it('can update isActive', async () => {
      const res = await request(app)
        .patch('/api/v1/libraries/test-lib')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isActive: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);

      // Restore active state for subsequent tests
      await request(app)
        .patch('/api/v1/libraries/test-lib')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true });
    });
  });

  describe('DELETE /api/v1/libraries/:id (soft-delete library)', () => {
    beforeAll(async () => {
      // Create a library to delete
      await request(app)
        .post('/api/v1/libraries')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: 'delete-me',
          name: 'Delete Me Library',
        });
    });

    it('soft-deletes a library as admin', async () => {
      const res = await request(app)
        .delete('/api/v1/libraries/delete-me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);

      // Verify the library is soft-deleted (isActive = false)
      const getRes = await request(app)
        .get('/api/v1/libraries/delete-me');

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.isActive).toBe(false);
    });

    it('returns 403 for regular user', async () => {
      const res = await request(app)
        .delete('/api/v1/libraries/test-lib')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent library', async () => {
      const res = await request(app)
        .delete('/api/v1/libraries/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/libraries/:libraryId/items (create item)', () => {
    it('creates an item with categories', async () => {
      const res = await request(app)
        .post('/api/v1/libraries/test-lib/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: 'bin-1x1',
          name: '1x1 Bin',
          widthUnits: 1,
          heightUnits: 1,
          color: '#3B82F6',
          categories: ['bin', 'labeled'],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('bin-1x1');
      expect(res.body.data.libraryId).toBe('test-lib');
      expect(res.body.data.name).toBe('1x1 Bin');
      expect(res.body.data.widthUnits).toBe(1);
      expect(res.body.data.heightUnits).toBe(1);
      expect(res.body.data.categories).toContain('bin');
      expect(res.body.data.categories).toContain('labeled');
    });

    it('creates an item without categories', async () => {
      const res = await request(app)
        .post('/api/v1/libraries/test-lib/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: 'bin-2x2',
          name: '2x2 Bin',
          widthUnits: 2,
          heightUnits: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('bin-2x2');
      expect(res.body.data.categories).toEqual([]);
    });

    it('returns 403 for regular user', async () => {
      const res = await request(app)
        .post('/api/v1/libraries/test-lib/items')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          id: 'forbidden-item',
          name: 'Forbidden Item',
          widthUnits: 1,
          heightUnits: 1,
        });

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent library', async () => {
      const res = await request(app)
        .post('/api/v1/libraries/non-existent/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: 'orphan-item',
          name: 'Orphan Item',
          widthUnits: 1,
          heightUnits: 1,
        });

      expect(res.status).toBe(404);
    });

    it('returns 409 for duplicate item ID in same library', async () => {
      const res = await request(app)
        .post('/api/v1/libraries/test-lib/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: 'bin-1x1',
          name: 'Duplicate Bin',
          widthUnits: 1,
          heightUnits: 1,
        });

      expect(res.status).toBe(409);
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/v1/libraries/test-lib/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Missing ID',
          widthUnits: 1,
        });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/v1/libraries/:libraryId/items/:itemId (update item)', () => {
    it('updates an item', async () => {
      const res = await request(app)
        .patch('/api/v1/libraries/test-lib/items/bin-1x1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated 1x1 Bin',
          color: '#EF4444',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated 1x1 Bin');
      expect(res.body.data.color).toBe('#EF4444');
    });

    it('updates item categories', async () => {
      const res = await request(app)
        .patch('/api/v1/libraries/test-lib/items/bin-1x1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categories: ['bin'],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.categories).toEqual(['bin']);
      expect(res.body.data.categories).not.toContain('labeled');
    });

    it('returns 403 for regular user', async () => {
      const res = await request(app)
        .patch('/api/v1/libraries/test-lib/items/bin-1x1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Hijacked',
        });

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent item', async () => {
      const res = await request(app)
        .patch('/api/v1/libraries/test-lib/items/non-existent')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Ghost Item',
        });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/libraries/:libraryId/items/:itemId (soft-delete item)', () => {
    beforeAll(async () => {
      // Create an item to delete
      await request(app)
        .post('/api/v1/libraries/test-lib/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: 'delete-item',
          name: 'Delete Me Item',
          widthUnits: 1,
          heightUnits: 1,
        });
    });

    it('soft-deletes an item as admin', async () => {
      const res = await request(app)
        .delete('/api/v1/libraries/test-lib/items/delete-item')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);

      // Verify the item is soft-deleted (isActive = false)
      const getRes = await request(app)
        .get('/api/v1/libraries/test-lib/items/delete-item');

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.isActive).toBe(false);
    });

    it('returns 403 for regular user', async () => {
      const res = await request(app)
        .delete('/api/v1/libraries/test-lib/items/bin-1x1')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent item', async () => {
      const res = await request(app)
        .delete('/api/v1/libraries/test-lib/items/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/libraries/:libraryId/items/:itemId/image (upload image)', () => {
    // Create a minimal valid PNG buffer (1x1 pixel)
    const pngBuffer = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
      '0000000a49444154789c626000000002000198e195280000000049454e44ae426082',
      'hex',
    );

    it('uploads an image for an item', async () => {
      const res = await request(app)
        .post('/api/v1/libraries/test-lib/items/bin-1x1/image')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', pngBuffer, 'test.png');

      expect(res.status).toBe(200);
      expect(res.body.data.imagePath).toBeDefined();
    });

    it('returns 403 for regular user', async () => {
      const res = await request(app)
        .post('/api/v1/libraries/test-lib/items/bin-1x1/image')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('image', pngBuffer, 'test.png');

      expect(res.status).toBe(403);
    });

    it('returns 400 without file', async () => {
      const res = await request(app)
        .post('/api/v1/libraries/test-lib/items/bin-1x1/image')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });
});
