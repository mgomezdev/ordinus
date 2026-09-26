import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendToThemisHandler } from './themis.controller.js';
import type { Request, Response, NextFunction } from 'express';

const THEMIS = 'http://localhost:8001';

const mocks = vi.hoisted(() => {
  class ThemisTimeoutError extends Error {}
  return {
    uploadStlToThemis: vi.fn(),
    createThemisProject: vi.fn(),
    addThemisProjectItem: vi.fn(),
    addThemisProjectLink: vi.fn(),
    getThemisProject: vi.fn(),
    getSetting: vi.fn(),
    updateSet: vi.fn(),
    selectQueue: [] as unknown[][],
    callOrder: [] as string[],
    ThemisTimeoutError,
  };
});

vi.mock('../services/themis.service.js', () => ({
  uploadStlToThemis: mocks.uploadStlToThemis,
  createThemisProject: mocks.createThemisProject,
  addThemisProjectItem: mocks.addThemisProjectItem,
  addThemisProjectLink: mocks.addThemisProjectLink,
  getThemisProject: mocks.getThemisProject,
  ThemisTimeoutError: mocks.ThemisTimeoutError,
}));

vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn().mockResolvedValue(Buffer.from('stl')) },
}));

vi.mock('../db/connection.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(mocks.selectQueue.shift() ?? [])),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: (values: unknown) => {
        mocks.updateSet(values);
        mocks.callOrder.push('db.update');
        return { where: vi.fn().mockResolvedValue(undefined) };
      },
    })),
  },
}));

vi.mock('../db/schema.js', () => ({ layouts: {}, bomGenerations: {}, customers: {} }));

vi.mock('../services/settings.service.js', () => ({
  getSetting: mocks.getSetting,
}));

function makeRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
}

function makeReq(layoutId = '1') {
  return { params: { layoutId } } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectQueue = [];
  mocks.callOrder = [];
  mocks.getSetting.mockImplementation((key: string) => Promise.resolve(key === 'themis_url' ? THEMIS : ''));
  mocks.uploadStlToThemis.mockResolvedValue(10);
  mocks.createThemisProject.mockImplementation(async () => {
    mocks.callOrder.push('createThemisProject');
    return 5;
  });
  mocks.addThemisProjectItem.mockImplementation(async () => {
    mocks.callOrder.push('addThemisProjectItem');
  });
  mocks.addThemisProjectLink.mockImplementation(async () => {
    mocks.callOrder.push('addThemisProjectLink');
  });
});

describe('sendToThemisHandler', () => {
  it('returns 503 when Themis URL is not configured', async () => {
    mocks.getSetting.mockResolvedValue(null);
    const origUrl = process.env['THEMIS_URL'];
    delete process.env['THEMIS_URL'];
    const res = makeRes();
    await sendToThemisHandler(makeReq(), res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(503);
    if (origUrl !== undefined) process.env['THEMIS_URL'] = origUrl;
  });

  it('persists the new Themis project id before adding items, so a crash mid-send can resume it', async () => {
    mocks.selectQueue.push(
      [{ id: 1, name: 'My Layout', customerId: null }], // layouts
      [{
        id: 1,
        layoutId: 1,
        status: 'ready',
        themisProjectId: null,
        fileManifest: JSON.stringify([{ filename: 'a.stl', widthUnits: 1, heightUnits: 1, qty: 2 }]),
      }], // bomGenerations
    );
    const res = makeRes();
    await sendToThemisHandler(makeReq(), res, vi.fn() as NextFunction);

    expect(mocks.createThemisProject).toHaveBeenCalledTimes(1);
    expect(mocks.updateSet).toHaveBeenCalledWith({ themisProjectId: 5 });
    // The DB write must land before any item is added, so a failed item add
    // still leaves the project id recorded and reusable on retry.
    expect(mocks.callOrder).toEqual(['createThemisProject', 'db.update', 'addThemisProjectItem', 'addThemisProjectLink']);
    expect(res.json).toHaveBeenCalledWith({ data: { projectUrl: `${THEMIS}/projects/5`, needsFilamentProfiles: true } });
  });

  it('resumes an existing Themis project on retry instead of creating a duplicate, skipping items/links already sent', async () => {
    mocks.selectQueue.push(
      [{ id: 1, name: 'My Layout', customerId: null }], // layouts
      [{
        id: 1,
        layoutId: 1,
        status: 'ready',
        themisProjectId: 5, // set by a prior, partially-completed attempt
        fileManifest: JSON.stringify([
          { filename: 'a.stl', widthUnits: 1, heightUnits: 1, qty: 2 }, // already sent
          { filename: 'b.stl', widthUnits: 1, heightUnits: 1, qty: 1 }, // still missing
        ]),
      }], // bomGenerations
    );
    mocks.uploadStlToThemis.mockImplementation((_url: string, _bytes: Buffer, filename: string) =>
      Promise.resolve(filename === 'a.stl' ? 10 : 20));
    mocks.getThemisProject.mockResolvedValue({
      id: 5,
      items: [{ file_id: 10 }],
      links: [{ url: 'http://localhost:3001/layouts/1' }],
    });

    const res = makeRes();
    await sendToThemisHandler(makeReq(), res, vi.fn() as NextFunction);

    expect(mocks.createThemisProject).not.toHaveBeenCalled();
    expect(mocks.updateSet).not.toHaveBeenCalled();
    expect(mocks.addThemisProjectItem).toHaveBeenCalledTimes(1);
    expect(mocks.addThemisProjectItem).toHaveBeenCalledWith(THEMIS, 5, 20, 1, undefined);
    expect(mocks.addThemisProjectLink).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ data: { projectUrl: `${THEMIS}/projects/5`, needsFilamentProfiles: true } });
  });

  it('returns 504 when a Themis request times out, instead of a generic 500', async () => {
    mocks.selectQueue.push(
      [{ id: 1, name: 'My Layout', customerId: null }], // layouts
      [{
        id: 1,
        layoutId: 1,
        status: 'ready',
        themisProjectId: null,
        fileManifest: JSON.stringify([{ filename: 'a.stl', widthUnits: 1, heightUnits: 1, qty: 2 }]),
      }], // bomGenerations
    );
    mocks.uploadStlToThemis.mockRejectedValue(new mocks.ThemisTimeoutError('Themis did not respond within 120000ms'));

    const res = makeRes();
    const next = vi.fn();
    await sendToThemisHandler(makeReq(), res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(504);
    expect(next).not.toHaveBeenCalled();
  });
});
