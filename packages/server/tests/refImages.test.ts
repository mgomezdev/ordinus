import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';

vi.mock('../src/db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../src/db/schema.js');
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  return { db, client };
});

vi.mock('../src/logger.js', () => ({
  logger: pino({ level: 'silent' }),
}));

vi.mock('../src/config.js', () => ({
  config: {
    IMAGE_DIR: '/tmp/test-images',
    USER_STL_DIR: '/tmp/test-user-stls',
    USER_STL_IMAGE_DIR: '/tmp/test-stl-images',
    PORT: 3001, NODE_ENV: 'test', DB_PATH: ':memory:',
    LOG_LEVEL: 'silent', CORS_ORIGIN: 'http://localhost:5173',
    JWT_SECRET: 'test-secret', JWT_REFRESH_SECRET: 'test-refresh-secret',
    MAX_STL_WORKERS: 1, PYTHON_SCRIPT_DIR: '/tmp/scripts',
  },
}));

// Mock the service so tests don't need real image storage
vi.mock('../src/services/refImage.service.js', () => ({
  listRefImages: vi.fn().mockResolvedValue([]),
  uploadRefImage: vi.fn().mockResolvedValue({
    id: 1, ownerId: 1, name: 'test.png', isGlobal: false,
    imageUrl: 'ref-lib/abc.webp', fileSize: 1024, createdAt: new Date().toISOString(),
  }),
  uploadGlobalRefImage: vi.fn().mockResolvedValue({
    id: 2, ownerId: null, name: 'global.png', isGlobal: true,
    imageUrl: 'ref-lib/def.webp', fileSize: 1024, createdAt: new Date().toISOString(),
  }),
  renameRefImage: vi.fn().mockResolvedValue({
    id: 1, ownerId: 1, name: 'renamed.png', isGlobal: false,
    imageUrl: 'ref-lib/abc.webp', fileSize: 1024, createdAt: new Date().toISOString(),
  }),
  deleteRefImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return { ...actual, mkdirSync: vi.fn() };
});

const { createApp } = await import('../src/app.js');
const { client: testClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

describe('Reference Image endpoints', () => {
  let app: ReturnType<typeof createApp>;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await runMigrations(testClient);
    app = createApp();

    const res1 = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'img-user@example.com', username: 'imguser', password: 'password123' });
    userToken = res1.body.data.accessToken;

    // Register + promote to admin
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'img-admin@example.com', username: 'imgadmin', password: 'password123' });
    await testClient.execute(`UPDATE users SET role='admin' WHERE email='img-admin@example.com'`);
    const res2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'img-admin@example.com', password: 'password123' });
    adminToken = res2.body.data.accessToken;
  });

  afterAll(() => { testClient.close(); });

  describe('Auth guards', () => {
    it('GET / returns 401 without token', async () => {
      expect((await request(app).get('/api/v1/ref-images')).status).toBe(401);
    });

    it('POST / returns 401 without token', async () => {
      expect((await request(app).post('/api/v1/ref-images')).status).toBe(401);
    });

    it('DELETE /:id returns 401 without token', async () => {
      expect((await request(app).delete('/api/v1/ref-images/1')).status).toBe(401);
    });
  });

  describe('GET /', () => {
    it('returns empty array for new user', async () => {
      const res = await request(app)
        .get('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [] });
    });
  });

  describe('POST / (upload)', () => {
    it('accepts image upload from authenticated user', async () => {
      const res = await request(app)
        .post('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('image', Buffer.from('fake-image-data'), 'photo.png');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name: 'test.png' }); // mock always returns 'test.png'
    });
  });

  describe('POST /global (admin only)', () => {
    it('returns 403 for regular user', async () => {
      const res = await request(app)
        .post('/api/v1/ref-images/global')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('image', Buffer.from('data'), 'global.png');
      expect(res.status).toBe(403);
    });

    it('accepts upload from admin', async () => {
      const res = await request(app)
        .post('/api/v1/ref-images/global')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', Buffer.from('data'), 'global.png');
      expect(res.status).toBe(201);
    });
  });

  describe('PATCH /:id (rename)', () => {
    it('renames an image for authenticated user', async () => {
      const res = await request(app)
        .patch('/api/v1/ref-images/1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'renamed.png' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ name: 'renamed.png' });
    });
  });

  describe('DELETE /:id', () => {
    it('deletes an image for authenticated user', async () => {
      const res = await request(app)
        .delete('/api/v1/ref-images/1')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(204);
    });
  });
});
