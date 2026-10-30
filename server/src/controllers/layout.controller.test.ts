import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../middleware/errorHandler.js';

const mockCreate = vi.fn().mockResolvedValue({
  id: 1, userId: null, customerId: null, customerName: null,
  name: 'Test', description: null,
  gridX: 4, gridY: 4, widthMm: 168, depthMm: 168,
  spacerHorizontal: 'none', spacerVertical: 'none',
  isPublic: false, createdAt: '', updatedAt: '',
  placedItems: [], refImagePlacements: [],
});

vi.mock('../services/layout.service.js', () => ({
  createLayout: (...args: unknown[]) => mockCreate(...args),
  getAllLayouts: vi.fn().mockResolvedValue({ data: [], nextCursor: null, hasMore: false }),
  getLayoutsByUser: vi.fn().mockResolvedValue({ data: [], nextCursor: null, hasMore: false }),
}));

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
          wallPatternEnabled: true, wallPattern: 'hexgrid', lipStyle: 'normal',
          fingerSlide: 'none', wallCutout: { front: false, back: false, left: false, right: false }, height: 10,
        },
      }],
    };
    const res = await request(app).post('/api/v1/layouts').send(payload);
    expect(res.status).toBe(201);
    const [data] = mockCreate.mock.calls[0] as [{ placedItems: Array<{ customization?: unknown }> }];
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
          wallPatternEnabled: false, wallPattern: 'grid', lipStyle: 'normal',
          fingerSlide: 'none', wallCutout: { front: false, back: false, left: false, right: false }, height: 8,
          unknownField: 'should be stripped',
        },
      }],
    };
    const res = await request(app).post('/api/v1/layouts').send(payload);
    expect(res.status).toBe(201);
    const [data] = mockCreate.mock.calls[0] as [{ placedItems: Array<{ customization?: Record<string, unknown> }> }];
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

describe('POST /api/v1/layouts — half-unit custom bins', () => {
  const base = { name: 'L', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168 };
  const item = {
    itemId: 'custom:custom-abc', x: 0.5, y: 1.5, width: 2.5, height: 1.5, rotation: 0,
    customSpec: { width: 2.5, depth: 1.5, height: 3.5, overrides: { magnet_diameter: 6.5 } },
  };

  it('passes half-unit positions, sizes and customSpec through', async () => {
    mockCreate.mockClear();
    const res = await request(await buildTestApp()).post('/api/v1/layouts').send({ ...base, placedItems: [item] });
    expect(res.status).toBe(201);
    const [data] = mockCreate.mock.calls[0] as [{ placedItems: Array<Record<string, unknown>> }];
    expect(data.placedItems[0]).toMatchObject({ x: 0.5, y: 1.5, width: 2.5, height: 1.5, customSpec: item.customSpec });
  });

  it.each([
    ['x not a multiple of 0.5', { ...item, x: 0.3 }],
    ['width below minimum', { ...item, width: 0 }],
    ['invalid customSpec', { ...item, customSpec: { ...item.customSpec, overrides: { nope: 1 } } }],
  ])('rejects %s', async (_label, bad) => {
    const res = await request(await buildTestApp()).post('/api/v1/layouts').send({ ...base, placedItems: [bad] });
    expect(res.status).toBe(400);
  });
});
