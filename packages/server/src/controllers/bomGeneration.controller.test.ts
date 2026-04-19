import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import { errorHandler } from '../middleware/errorHandler.js';

// Mock the service so we don't spawn real subprocesses
vi.mock('../services/bomGeneration.service.js', () => ({
  triggerGeneration: vi.fn().mockResolvedValue({
    id: 1, submissionId: 42, status: 'generating',
    fileManifest: null, threeMfPath: null, generatedAt: null, errorMessage: null,
  }),
  getGeneration: vi.fn().mockResolvedValue({
    id: 1, submissionId: 42, status: 'ready',
    fileManifest: [{ filename: 'bin_2x3x8.stl', widthUnits: 2, heightUnits: 3, qty: 2 }],
    threeMfPath: '/data/generated/bom-42/bom-42.3mf',
    generatedAt: '2026-04-17T00:00:00Z',
    errorMessage: null,
  }),
}));

// Mock auth middleware to inject user by header for testing
vi.mock('../middleware/auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../middleware/auth.js')>();
  return {
    ...actual,
    requireAuth: vi.fn((req: express.Request, _res: express.Response, next: express.NextFunction) => {
      const role = req.headers['x-test-role'] as string | undefined;
      if (!role) {
        next(new AppError(ErrorCodes.AUTH_REQUIRED, 'Auth required'));
        return;
      }
      req.user = { userId: 1, role };
      next();
    }),
  };
});

// Build a minimal app with just the BOM generation routes + error handler
async function buildTestApp() {
  const app = express();
  app.use(express.json());
  const bomGenerationRoutes = (await import('../routes/bomGeneration.routes.js')).default;
  app.use('/api/v1', bomGenerationRoutes);
  app.use(errorHandler);
  return app;
}

describe('POST /api/v1/admin/bom/:submissionId/generate — security', () => {
  it('returns 401 with no auth', async () => {
    const app = await buildTestApp();
    const res = await request(app).post('/api/v1/admin/bom/42/generate');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/v1/admin/bom/42/generate')
      .set('x-test-role', 'user');
    expect(res.status).toBe(403);
  });

  it('returns 202 for admin user', async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/v1/admin/bom/42/generate')
      .set('x-test-role', 'admin');
    expect(res.status).toBe(202);
  });
});

describe('GET /api/v1/admin/bom/:submissionId/generation — security', () => {
  it('returns 401 with no auth', async () => {
    const app = await buildTestApp();
    const res = await request(app).get('/api/v1/admin/bom/42/generation');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .get('/api/v1/admin/bom/42/generation')
      .set('x-test-role', 'user');
    expect(res.status).toBe(403);
  });

  it('returns 200 with generation data for admin', async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .get('/api/v1/admin/bom/42/generation')
      .set('x-test-role', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
  });
});

describe('GET /api/v1/admin/bom/:submissionId/files/:filename — security', () => {
  it('returns 401 with no auth', async () => {
    const app = await buildTestApp();
    const res = await request(app).get('/api/v1/admin/bom/42/files/bin_2x3x8.stl');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .get('/api/v1/admin/bom/42/files/bin_2x3x8.stl')
      .set('x-test-role', 'user');
    expect(res.status).toBe(403);
  });
});
