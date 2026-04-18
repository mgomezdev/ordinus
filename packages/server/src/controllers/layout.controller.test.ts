import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../middleware/errorHandler.js';

const mockCreate = vi.fn().mockResolvedValue({
  id: 1, userId: 1, name: 'Test', description: null,
  gridX: 4, gridY: 4, widthMm: 168, depthMm: 168,
  spacerHorizontal: 'none', spacerVertical: 'none',
  status: 'draft', isPublic: false, createdAt: '', updatedAt: '',
  placedItems: [], refImagePlacements: [],
});

vi.mock('../services/layout.service.js', () => ({
  createLayout: (...args: unknown[]) => mockCreate(...args),
  getLayouts: vi.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
}));

vi.mock('../middleware/auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../middleware/auth.js')>();
  return {
    ...actual,
    requireAuth: vi.fn((req: express.Request, _res: express.Response, next: express.NextFunction) => {
      req.user = { userId: 1, role: 'user' };
      next();
    }),
    optionalAuth: vi.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => {
      next();
    }),
  };
});

async function buildTestApp() {
  const app = express();
  app.use(express.json());
  const layoutRoutes = (await import('../routes/layouts.routes.js')).default;
  app.use('/api/v1/layouts', layoutRoutes);
  app.use(errorHandler);
  return app;
}

describe('POST /api/v1/layouts — customization field', () => {
  it('accepts and passes through bin customization on placed items', async () => {
    const app = await buildTestApp();
    const payload = {
      name: 'Test Layout', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168,
      placedItems: [{
        itemId: 'bins_standard:bin-2x3',
        x: 0, y: 0, width: 2, height: 3, rotation: 0,
        customization: {
          wallPattern: 'hexgrid', lipStyle: 'normal',
          fingerSlide: 'none', wallCutout: 'none', height: 10,
        },
      }],
    };
    const res = await request(app).post('/api/v1/layouts').send(payload);
    expect(res.status).toBe(201);
    const [, data] = mockCreate.mock.calls[0] as [number, { placedItems: Array<{ customization?: unknown }> }];
    expect(data.placedItems[0].customization).toEqual(payload.placedItems[0].customization);
  });

  it('strips unknown fields from customization', async () => {
    mockCreate.mockClear();
    const app = await buildTestApp();
    const payload = {
      name: 'Test Layout', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168,
      placedItems: [{
        itemId: 'bins_standard:bin-1x1',
        x: 0, y: 0, width: 1, height: 1, rotation: 0,
        customization: {
          wallPattern: 'none', lipStyle: 'normal',
          fingerSlide: 'none', wallCutout: 'none', height: 8,
          unknownField: 'should be stripped',
        },
      }],
    };
    const res = await request(app).post('/api/v1/layouts').send(payload);
    expect(res.status).toBe(201);
    const [, data] = mockCreate.mock.calls[0] as [number, { placedItems: Array<{ customization?: Record<string, unknown> }> }];
    expect(data.placedItems[0].customization).not.toHaveProperty('unknownField');
  });

  it('accepts placed item without customization', async () => {
    mockCreate.mockClear();
    const app = await buildTestApp();
    const payload = {
      name: 'Test Layout', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168,
      placedItems: [{ itemId: 'bins_standard:bin-1x1', x: 0, y: 0, width: 1, height: 1, rotation: 0 }],
    };
    const res = await request(app).post('/api/v1/layouts').send(payload);
    expect(res.status).toBe(201);
  });
});
