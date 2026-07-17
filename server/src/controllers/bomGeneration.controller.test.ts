import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../services/bomGeneration.service.js', () => ({
  triggerGeneration: vi.fn(),
  getGeneration: vi.fn(),
}));

// Mock DB + layout ownership check
vi.mock('../db/connection.js', () => ({ db: {} }));
vi.mock('../db/schema.js', () => ({ layouts: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));
vi.mock('fs', () => ({ createReadStream: vi.fn(), existsSync: vi.fn() }));

import * as bomGenerationService from '../services/bomGeneration.service.js';
import { generateHandler, getGenerationHandler, serveFileHandler } from './bomGeneration.controller.js';

function makeReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    params: {},
    body: {},
    ...overrides,
  };
}

function makeRes(): {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
} {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const next = vi.fn() as unknown as NextFunction;

async function setupDbMock(userId: number): Promise<void> {
  const { db } = await import('../db/connection.js');
  const mockLimit = vi.fn().mockResolvedValue([{ userId }]);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  Object.assign(db, { select: mockSelect });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateHandler', () => {
  it('returns 202 with generation record on success', async () => {
    const mockGeneration = {
      id: 1,
      layoutId: 5,
      status: 'generating' as const,
      fileManifest: null,
      threeMfPath: null,
      generatedAt: null,
      errorMessage: null,
      themisProjectId: null,
    };
    vi.mocked(bomGenerationService.triggerGeneration).mockResolvedValueOnce(mockGeneration);
    await setupDbMock(1);

    const req = makeReq({ params: { layoutId: '5' }, body: { bomItems: [] } });
    const res = makeRes();

    await generateHandler(req as Request, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ data: mockGeneration });
  });

  it('calls next with error if layoutId is NaN', async () => {
    const req = makeReq({ params: { layoutId: 'bad' } });
    const res = makeRes();
    await generateHandler(req as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('calls next with FORBIDDEN if user does not own layout', async () => {
    const { db } = await import('../db/connection.js');
    const mockLimit = vi.fn().mockResolvedValue([{ userId: 99 }]); // different owner
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    Object.assign(db, { select: mockSelect });

    const req = makeReq({ params: { layoutId: '5' }, body: { bomItems: [] } });
    const res = makeRes();
    await generateHandler(req as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('calls next with NOT_FOUND if layout does not exist', async () => {
    const { db } = await import('../db/connection.js');
    const mockLimit = vi.fn().mockResolvedValue([]); // no rows
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    Object.assign(db, { select: mockSelect });

    const req = makeReq({ params: { layoutId: '5' }, body: { bomItems: [] } });
    const res = makeRes();
    await generateHandler(req as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});

describe('getGenerationHandler', () => {
  it('returns 200 with generation record when found', async () => {
    const mockGeneration = {
      id: 1,
      layoutId: 5,
      status: 'ready' as const,
      fileManifest: null,
      threeMfPath: null,
      generatedAt: null,
      errorMessage: null,
      themisProjectId: null,
    };
    vi.mocked(bomGenerationService.getGeneration).mockResolvedValueOnce(mockGeneration);
    await setupDbMock(1);

    const req = makeReq({ params: { layoutId: '5' } });
    const res = makeRes();

    await getGenerationHandler(req as Request, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: mockGeneration });
  });

  it('calls next with NOT_FOUND when no generation exists', async () => {
    vi.mocked(bomGenerationService.getGeneration).mockResolvedValueOnce(null);
    await setupDbMock(1);

    const req = makeReq({ params: { layoutId: '5' } });
    const res = makeRes();

    await getGenerationHandler(req as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('calls next with VALIDATION_ERROR if layoutId is NaN', async () => {
    const req = makeReq({ params: { layoutId: 'nan' } });
    const res = makeRes();
    await getGenerationHandler(req as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
});

describe('serveFileHandler', () => {
  it('calls next with VALIDATION_ERROR for path traversal in filename', async () => {
    await setupDbMock(1);
    const req = makeReq({ params: { layoutId: '5', filename: '../secret.stl' } });
    const res = makeRes();
    await serveFileHandler(req as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('calls next with VALIDATION_ERROR for filename with forward slash', async () => {
    await setupDbMock(1);
    const req = makeReq({ params: { layoutId: '5', filename: 'sub/dir.stl' } });
    const res = makeRes();
    await serveFileHandler(req as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('calls next with VALIDATION_ERROR for filename with double-quote (header injection)', async () => {
    await setupDbMock(1);
    const req = makeReq({ params: { layoutId: '5', filename: 'file"name.stl' } });
    const res = makeRes();
    await serveFileHandler(req as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('calls next with VALIDATION_ERROR for filename with newline (header injection)', async () => {
    await setupDbMock(1);
    const req = makeReq({ params: { layoutId: '5', filename: 'file\nname.stl' } });
    const res = makeRes();
    await serveFileHandler(req as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('calls next with NOT_FOUND when file does not exist', async () => {
    await setupDbMock(1);
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const req = makeReq({ params: { layoutId: '5', filename: 'bin_2x3x4.stl' } });
    const res = makeRes();
    await serveFileHandler(req as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});
