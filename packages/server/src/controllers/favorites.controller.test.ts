import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../middleware/errorHandler.js';

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockDelete = vi.fn();
const mockRename = vi.fn();

vi.mock('../services/favorites.service.js', () => ({
  listFavorites: (...args: unknown[]) => mockList(...args),
  createFavorite: (...args: unknown[]) => mockCreate(...args),
  deleteFavorite: (...args: unknown[]) => mockDelete(...args),
  renameFavorite: (...args: unknown[]) => mockRename(...args),
}));

vi.mock('../middleware/auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../middleware/auth.js')>();
  return {
    ...actual,
    requireAuth: vi.fn((req: express.Request, _res: express.Response, next: express.NextFunction) => {
      req.user = { userId: 42, role: 'user' };
      next();
    }),
  };
});

async function buildApp() {
  const app = express();
  app.use(express.json());
  const favRoutes = (await import('../routes/favorites.routes.js')).default;
  app.use('/api/v1/favorites', favRoutes);
  app.use(errorHandler);
  return app;
}

const validCustomization = {
  wallPatternEnabled: false,
  wallPattern: 'grid',
  lipStyle: 'normal',
  fingerSlide: 'none',
  wallCutout: 'none',
  height: 4,
};

const validBody = {
  name: 'My Bin',
  libraryId: 'bins_standard',
  libraryItemId: 'bin_2x3x7',
  libraryItemName: 'Bin 2×3×7',
  widthUnits: 2,
  heightUnits: 3,
  color: '#3B82F6',
  imageUrl: '/images/bin.png',
  customization: validCustomization,
};

describe('GET /api/v1/favorites', () => {
  beforeEach(() => mockList.mockResolvedValue([]));

  it('returns favorites for the authenticated user', async () => {
    const app = await buildApp();
    mockList.mockResolvedValue([{ id: 'fav1', name: 'My Bin', customization: JSON.stringify(validCustomization) }]);
    const res = await request(app).get('/api/v1/favorites');
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(42);
  });
});

describe('POST /api/v1/favorites', () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({ id: 'fav1', ...validBody, customization: JSON.stringify(validCustomization), createdAt: 1000 });
  });

  it('creates a favorite and returns 201', async () => {
    const app = await buildApp();
    const res = await request(app).post('/api/v1/favorites').send(validBody);
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(42, expect.objectContaining({ name: 'My Bin' }));
  });

  it('rejects body missing required fields', async () => {
    const app = await buildApp();
    const res = await request(app).post('/api/v1/favorites').send({ name: 'test' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/favorites/:id', () => {
  it('returns 204 on success', async () => {
    mockDelete.mockResolvedValue(true);
    const app = await buildApp();
    const res = await request(app).delete('/api/v1/favorites/fav1');
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith('fav1', 42);
  });

  it('returns 404 when favorite not found or not owned', async () => {
    mockDelete.mockResolvedValue(false);
    const app = await buildApp();
    const res = await request(app).delete('/api/v1/favorites/missing');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/favorites/:id/name', () => {
  it('returns 200 on success', async () => {
    mockRename.mockResolvedValue(true);
    const app = await buildApp();
    const res = await request(app).patch('/api/v1/favorites/fav1/name').send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(mockRename).toHaveBeenCalledWith('fav1', 42, 'Renamed');
  });

  it('returns 404 when favorite not found or not owned', async () => {
    mockRename.mockResolvedValue(false);
    const app = await buildApp();
    const res = await request(app).patch('/api/v1/favorites/missing/name').send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});
