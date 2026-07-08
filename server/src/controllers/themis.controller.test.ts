import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendToThemisHandler } from './themis.controller.js';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../services/themis.service.js', () => ({
  uploadStlToThemis: vi.fn().mockResolvedValue(10),
  createThemisProject: vi.fn().mockResolvedValue(5),
  addThemisProjectItem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn().mockResolvedValue(Buffer.from('stl')) },
}));

vi.mock('../db/connection.js', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 1,
              name: 'My Layout',
              userId: 1,
            },
          ]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

vi.mock('../db/schema.js', () => ({ layouts: {}, bomGenerations: {}, users: {} }));

describe('sendToThemisHandler', () => {
  it('returns 503 when THEMIS_URL is not configured', async () => {
    const origUrl = process.env['THEMIS_URL'];
    delete process.env['THEMIS_URL'];
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const req = { params: { layoutId: '1' }, user: { userId: 1 } } as unknown as Request;
    await sendToThemisHandler(req, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(503);
    if (origUrl !== undefined) process.env['THEMIS_URL'] = origUrl;
  });
});
