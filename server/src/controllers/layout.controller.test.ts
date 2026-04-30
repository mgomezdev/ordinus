import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../middleware/errorHandler.js';

const mockCreate = vi.fn().mockResolvedValue({
  id: 1, userId: 1, name: 'Test', description: null,
  gridX: 4, gridY: 4, widthMm: 168, depthMm: 168,
  spacerHorizontal: 'none', spacerVertical: 'none',
  status: 'draft', isPublic: false, createdAt: '', updatedAt: '',
  placedItems: [], refImagePlacements: [],
});

const mockGetUsers = vi.fn();
const mockGetLayoutsByUser = vi.fn();

vi.mock('../services/layout.service.js', () => ({
  createLayout: (...args: unknown[]) => mockCreate(...args),
  getLayouts: vi.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
  getUsers: (...args: unknown[]) => mockGetUsers(...args),
  getLayoutsByUser: (...args: unknown[]) => mockGetLayoutsByUser(...args),
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
          wallPatternEnabled: true, wallPattern: 'hexgrid', lipStyle: 'normal',
          fingerSlide: 'none', wallCutout: { front: false, back: false, left: false, right: false }, height: 10,
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
          wallPatternEnabled: false, wallPattern: 'grid', lipStyle: 'normal',
          fingerSlide: 'none', wallCutout: { front: false, back: false, left: false, right: false }, height: 8,
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

// ============================================================
// Admin handler unit tests (mock-based)
// ============================================================

function makeRes(): {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

function makeNext(): ReturnType<typeof vi.fn> {
  return vi.fn();
}

describe('getAdminUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with user list', async () => {
    const { getAdminUsers } = await import('./layout.controller.js');
    mockGetUsers.mockResolvedValueOnce([
      { id: 1, username: 'alice' },
      { id: 2, username: 'bob' },
    ]);

    const req = { user: { userId: 99, role: 'admin' } } as unknown as Request;
    const res = makeRes();
    const next = makeNext();

    await getAdminUsers(req, res as unknown as Response, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [
        { id: 1, username: 'alice' },
        { id: 2, username: 'bob' },
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 200 with empty array when no users exist', async () => {
    const { getAdminUsers } = await import('./layout.controller.js');
    mockGetUsers.mockResolvedValueOnce([]);

    const req = { user: { userId: 99, role: 'admin' } } as unknown as Request;
    const res = makeRes();
    const next = makeNext();

    await getAdminUsers(req, res as unknown as Response, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });

  it('calls next with error if service throws', async () => {
    const { getAdminUsers } = await import('./layout.controller.js');
    const err = new Error('DB failure');
    mockGetUsers.mockRejectedValueOnce(err);

    const req = { user: { userId: 99, role: 'admin' } } as unknown as Request;
    const res = makeRes();
    const next = makeNext();

    await getAdminUsers(req, res as unknown as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(err);
  });
});

describe('listAdminUserLayouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with layouts for the given userId', async () => {
    const { listAdminUserLayouts } = await import('./layout.controller.js');
    const mockLayout = {
      id: 10, userId: 3, name: 'My Layout',
      gridX: 4, gridY: 4, widthMm: 168, depthMm: 168,
      status: 'draft', isPublic: false,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockGetLayoutsByUser.mockResolvedValueOnce({
      data: [mockLayout],
      nextCursor: undefined,
      hasMore: false,
    });

    const req = {
      user: { userId: 99, role: 'admin' },
      query: { userId: '3' },
    } as unknown as Request;
    const res = makeRes();
    const next = makeNext();

    await listAdminUserLayouts(req, res as unknown as Response, next as unknown as NextFunction);

    expect(mockGetLayoutsByUser).toHaveBeenCalledWith(3, undefined, 20);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [mockLayout],
      nextCursor: undefined,
      hasMore: false,
    });
  });

  it('calls next with VALIDATION_ERROR if userId param is missing', async () => {
    const { listAdminUserLayouts } = await import('./layout.controller.js');

    const req = {
      user: { userId: 99, role: 'admin' },
      query: {},
    } as unknown as Request;
    const res = makeRes();
    const next = makeNext();

    await listAdminUserLayouts(req, res as unknown as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('calls next with VALIDATION_ERROR if userId is not a number', async () => {
    const { listAdminUserLayouts } = await import('./layout.controller.js');

    const req = {
      user: { userId: 99, role: 'admin' },
      query: { userId: 'bad' },
    } as unknown as Request;
    const res = makeRes();
    const next = makeNext();

    await listAdminUserLayouts(req, res as unknown as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });
});
