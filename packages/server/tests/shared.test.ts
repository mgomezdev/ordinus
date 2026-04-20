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

describe('Sharing endpoints', () => {
  let app: ReturnType<typeof createApp>;
  let accessToken: string;
  let accessToken2: string;
  let layoutId: number;

  beforeAll(async () => {
    await runMigrations(testClient);
    app = createApp();

    // Register two users
    const res1 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'share-user@example.com',
        username: 'shareuser',
        password: 'password123',
      });
    accessToken = res1.body.data.accessToken;

    const res2 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'share-user2@example.com',
        username: 'shareuser2',
        password: 'password123',
      });
    accessToken2 = res2.body.data.accessToken;

    // Create a layout to share
    const layoutRes = await request(app)
      .post('/api/v1/layouts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Share Test Layout',
        description: 'A layout for sharing tests',
        gridX: 4,
        gridY: 4,
        widthMm: 168,
        depthMm: 168,
        placedItems: [
          { itemId: 'bins_standard:bin-1x1', x: 0, y: 0, width: 1, height: 1, rotation: 0 },
          { itemId: 'bins_standard:bin-2x1', x: 1, y: 0, width: 2, height: 1, rotation: 0 },
        ],
      });
    layoutId = layoutRes.body.data.id;
  });

  afterAll(() => {
    testClient.close();
  });

  describe('POST /api/v1/layouts/:id/share', () => {
    it('creates a share link for owned layout', async () => {
      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/share`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.layoutId).toBe(layoutId);
      expect(res.body.data.slug).toBeDefined();
      expect(res.body.data.slug.length).toBe(12);
      expect(res.body.data.viewCount).toBe(0);
      expect(res.body.data.expiresAt).toBeNull();
    });

    it('creates a share link with expiration', async () => {
      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/share`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expiresInDays: 30 });

      expect(res.status).toBe(201);
      expect(res.body.data.expiresAt).toBeDefined();
      expect(res.body.data.expiresAt).not.toBeNull();

      // Verify the expiration is roughly 30 days from now
      const expiresAt = new Date(res.body.data.expiresAt);
      const now = new Date();
      const diffDays = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(29);
      expect(diffDays).toBeLessThan(31);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/share`)
        .send({});

      expect(res.status).toBe(401);
    });

    it('returns 403 for non-owned layout', async () => {
      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/share`)
        .set('Authorization', `Bearer ${accessToken2}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent layout', async () => {
      const res = await request(app)
        .post('/api/v1/layouts/99999/share')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(404);
    });

    it('validates expiresInDays range', async () => {
      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/share`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expiresInDays: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates expiresInDays max', async () => {
      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/share`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expiresInDays: 400 });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/shared/:slug', () => {
    let shareSlug: string;

    beforeAll(async () => {
      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/share`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      shareSlug = res.body.data.slug;
    });

    it('returns shared layout by slug (public, no auth)', async () => {
      const res = await request(app)
        .get(`/api/v1/shared/${shareSlug}`);

      expect(res.status).toBe(200);
      expect(res.body.data.layout).toBeDefined();
      expect(res.body.data.layout.name).toBe('Share Test Layout');
      expect(res.body.data.placedItems).toBeInstanceOf(Array);
      expect(res.body.data.placedItems.length).toBe(2);
      expect(res.body.data.sharedBy).toBe('shareuser');
    });

    it('increments view count on each access', async () => {
      // Access it once more
      await request(app).get(`/api/v1/shared/${shareSlug}`);

      // List shares to check the view count
      const listRes = await request(app)
        .get(`/api/v1/layouts/${layoutId}/shares`)
        .set('Authorization', `Bearer ${accessToken}`);

      const share = listRes.body.data.find(
        (s: { slug: string }) => s.slug === shareSlug,
      );
      // The view count should be at least 2 from our accesses
      expect(share.viewCount).toBeGreaterThanOrEqual(2);
    });

    it('returns 404 for non-existent slug', async () => {
      const res = await request(app)
        .get('/api/v1/shared/nonexistentxx');

      expect(res.status).toBe(404);
    });

    it('returns 404 for expired share', async () => {
      // Create a share with 1-day expiration, then manually expire it
      const createRes = await request(app)
        .post(`/api/v1/layouts/${layoutId}/share`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expiresInDays: 1 });

      const expiredSlug = createRes.body.data.slug;

      // Manually set the expires_at to the past via direct DB access
      const { db } = await import('../src/db/connection.js');
      const { sharedProjects } = await import('../src/db/schema.js');
      const { eq } = await import('drizzle-orm');

      await db
        .update(sharedProjects)
        .set({ expiresAt: '2020-01-01T00:00:00.000Z' })
        .where(eq(sharedProjects.slug, expiredSlug));

      const res = await request(app)
        .get(`/api/v1/shared/${expiredSlug}`);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/shared/:shareId', () => {
    let shareId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post(`/api/v1/layouts/${layoutId}/share`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      shareId = res.body.data.id;
    });

    it('deletes a share link (owner)', async () => {
      const res = await request(app)
        .delete(`/api/v1/shared/${shareId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(204);

      // Verify it's gone
      const listRes = await request(app)
        .get(`/api/v1/layouts/${layoutId}/shares`)
        .set('Authorization', `Bearer ${accessToken}`);

      const found = listRes.body.data.find(
        (s: { id: number }) => s.id === shareId,
      );
      expect(found).toBeUndefined();
    });

    it('returns 404 for already deleted share', async () => {
      const res = await request(app)
        .delete(`/api/v1/shared/${shareId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 for non-owner', async () => {
      // Create a new share
      const createRes = await request(app)
        .post(`/api/v1/layouts/${layoutId}/share`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      const newShareId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/api/v1/shared/${newShareId}`)
        .set('Authorization', `Bearer ${accessToken2}`);

      expect(res.status).toBe(403);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .delete('/api/v1/shared/1');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/layouts/:id/shares', () => {
    it('lists shares for a layout', async () => {
      const res = await request(app)
        .get(`/api/v1/layouts/${layoutId}/shares`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].slug).toBeDefined();
      expect(res.body.data[0].layoutId).toBe(layoutId);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .get(`/api/v1/layouts/${layoutId}/shares`);

      expect(res.status).toBe(401);
    });

    it('returns 403 for non-owner', async () => {
      const res = await request(app)
        .get(`/api/v1/layouts/${layoutId}/shares`)
        .set('Authorization', `Bearer ${accessToken2}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent layout', async () => {
      const res = await request(app)
        .get('/api/v1/layouts/99999/shares')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });
});
