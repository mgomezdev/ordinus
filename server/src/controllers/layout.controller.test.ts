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

describe('POST /api/v1/layouts — half-cell geometry', () => {
  const base = { name: 'L', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168 };
  const customSpec = { width: 2.5, depth: 1.5, height: 3.5, overrides: { magnet_diameter: 6.5 } };
  // Half-cells: 1 unit = 2, so 2.5 x 1.5 units at (0.5, 1.5) is 5 x 3 at (1, 3).
  const item = { itemId: 'custom:custom-abc', x: 1, y: 3, width: 5, height: 3, rotation: 0, customSpec };

  async function post(body: Record<string, unknown>) {
    mockCreate.mockClear();
    const res = await request(await buildTestApp()).post('/api/v1/layouts').send(body);
    const data = mockCreate.mock.calls[0]?.[0] as { gridResolution: number; placedItems: Array<Record<string, unknown>> } | undefined;
    return { res, data };
  }

  it('passes half-cell geometry and customSpec through at resolution 2', async () => {
    const { res, data } = await post({ ...base, gridResolution: 2, placedItems: [item] });
    expect(res.status).toBe(201);
    expect(data?.gridResolution).toBe(2);
    expect(data?.placedItems[0]).toMatchObject({ x: 1, y: 3, width: 5, height: 3, customSpec });
  });

  it('rescales whole-unit payloads (no resolution) to half-cells', async () => {
    const legacy = { itemId: 'bins_standard:bin-3x2', x: 1, y: 2, width: 3, height: 2, rotation: 0 };
    const { res, data } = await post({ ...base, placedItems: [legacy] });
    expect(res.status).toBe(201);
    expect(data?.gridResolution).toBe(2);
    expect(data?.placedItems[0]).toMatchObject({ x: 2, y: 4, width: 6, height: 4 });
  });

  it.each([
    ['fractional half-cell position', { ...item, x: 0.5 }],
    ['width below one half-cell', { ...item, width: 0 }],
    ['wider than 20 units', { ...item, width: 41 }],
    ['invalid customSpec', { ...item, customSpec: { ...customSpec, overrides: { nope: 1 } } }],
  ])('rejects %s', async (_label, bad) => {
    const { res } = await post({ ...base, gridResolution: 2, placedItems: [bad] });
    expect(res.status).toBe(400);
  });

  it('rejects a whole-unit payload that exceeds the maximum once rescaled', async () => {
    const legacy = { itemId: 'bins_standard:bin-3x2', x: 0, y: 0, width: 21, height: 2, rotation: 0 };
    const { res } = await post({ ...base, placedItems: [legacy] });
    expect(res.status).toBe(400);
  });

  it('rejects unknown grid resolutions', async () => {
    const { res } = await post({ ...base, gridResolution: 3, placedItems: [item] });
    expect(res.status).toBe(400);
  });
});
