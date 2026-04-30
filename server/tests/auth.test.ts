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

describe('Auth endpoints', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    await runMigrations(testClient);
    app = createApp();
  });

  afterAll(() => {
    testClient.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('registers a new user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          username: 'testuser',
          password: 'password123',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('test@example.com');
      expect(res.body.data.user.username).toBe('testuser');
      expect(res.body.data.user.role).toBe('user');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // Should not return password hash
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.user.password_hash).toBeUndefined();
    });

    it('rejects duplicate email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          username: 'different-user',
          password: 'password123',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('rejects duplicate username', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'different@example.com',
          username: 'testuser',
          password: 'password123',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('validates email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          username: 'validuser',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates username format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'valid@example.com',
          username: 'a',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates password length', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'valid2@example.com',
          username: 'validuser2',
          password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('logs in with valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('test@example.com');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('rejects invalid password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('rejects non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('Account lockout', () => {
    beforeAll(async () => {
      // Register a user for lockout testing
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'lockout@example.com',
          username: 'lockoutuser',
          password: 'password123',
        });
    });

    it('locks account after 5 failed attempts', async () => {
      // Attempt 5 failed logins
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'lockout@example.com',
            password: 'wrongpassword',
          });
      }

      // 6th attempt should be locked
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'lockout@example.com',
          password: 'password123', // correct password, but locked
        });

      expect(res.status).toBe(423);
      expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    let refreshToken: string;

    beforeAll(async () => {
      // Register a user and get tokens
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'refresh@example.com',
          username: 'refreshuser',
          password: 'password123',
        });
      refreshToken = res.body.data.refreshToken;
    });

    it('issues new token pair with valid refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // New refresh token should be different
      expect(res.body.data.refreshToken).not.toBe(refreshToken);

      // Update for subsequent tests
      refreshToken = res.body.data.refreshToken;
    });

    it('rejects invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('Token reuse detection', () => {
    it('revokes entire family when a used token is reused', async () => {
      // Register a new user
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'reuse@example.com',
          username: 'reuseuser',
          password: 'password123',
        });

      const originalRefreshToken = registerRes.body.data.refreshToken;

      // Use the token to get a new pair
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalRefreshToken });

      expect(refreshRes.status).toBe(200);
      const newRefreshToken = refreshRes.body.data.refreshToken;

      // Try to reuse the original (now revoked) token
      const reuseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalRefreshToken });

      expect(reuseRes.status).toBe(401);

      // The new token in the same family should also be revoked
      const familyRevokedRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: newRefreshToken });

      expect(familyRevokedRes.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('logs out and revokes token family', async () => {
      // Register and login
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'logout@example.com',
          username: 'logoutuser',
          password: 'password123',
        });

      const { accessToken, refreshToken } = registerRes.body.data;

      // Logout
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

      expect(logoutRes.status).toBe(204);

      // Refresh token should no longer work
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(401);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'some-token' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    let accessToken: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'me@example.com',
          username: 'meuser',
          password: 'password123',
        });
      accessToken = res.body.data.accessToken;
    });

    it('returns current user', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('me@example.com');
      expect(res.body.data.username).toBe('meuser');
      expect(res.body.data.role).toBe('user');
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me');

      expect(res.status).toBe(401);
    });

    it('rejects invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/auth/me', () => {
    let accessToken: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'update@example.com',
          username: 'updateuser',
          password: 'password123',
        });
      accessToken = res.body.data.accessToken;
    });

    it('updates username', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ username: 'newusername' });

      expect(res.status).toBe(200);
      expect(res.body.data.username).toBe('newusername');
    });

    it('updates email', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: 'newemail@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('newemail@example.com');
    });

    it('rejects empty update', async () => {
      const res = await request(app)
        .patch('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    let accessToken: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'changepw@example.com',
          username: 'changepwuser',
          password: 'password123',
        });
      accessToken = res.body.data.accessToken;
    });

    it('changes password with correct current password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'newpassword456',
        });

      expect(res.status).toBe(204);

      // Verify new password works
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'changepw@example.com',
          password: 'newpassword456',
        });

      expect(loginRes.status).toBe(200);
    });

    it('rejects wrong current password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'wrongcurrent',
          newPassword: 'newpassword789',
        });

      expect(res.status).toBe(401);
    });

    it('validates new password length', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'newpassword456',
          newPassword: 'short',
        });

      expect(res.status).toBe(400);
    });
  });
});
