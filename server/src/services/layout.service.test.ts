import { describe, it, expect, vi, beforeAll } from 'vitest';
import { AppError, ErrorCodes } from '@gridfinity/shared';

vi.mock('../db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../db/schema.js');
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  return { db, client };
});

vi.mock('../logger.js', async () => {
  const pino = (await import('pino')).default;
  return { logger: pino({ level: 'silent' }) };
});

const generateThumbnail = vi.fn().mockResolvedValue('thumb.png');
vi.mock('./layoutThumbnail.service.js', () => ({
  generate: (...args: unknown[]) => generateThumbnail(...args),
  deleteThumbnail: vi.fn().mockResolvedValue(undefined),
}));

const releaseWarps = vi.fn().mockResolvedValue(undefined);
vi.mock('./refImageWarp.service.js', () => ({
  releaseWarps: (...args: unknown[]) => releaseWarps(...args),
}));

const { runMigrations } = await import('../db/migrate.js');
const { client: testClient } = await import('../db/connection.js');
const layoutService = await import('./layout.service.js');

let customerId: number;
let refImageId: number;

beforeAll(async () => {
  await runMigrations(testClient);
  const cust = await testClient.execute({
    sql: `INSERT INTO customers (name, created_at, updated_at) VALUES (?, '', '') RETURNING id`,
    args: ['Acme'],
  });
  customerId = Number(cust.rows[0].id);
  const ref = await testClient.execute({
    sql: `INSERT INTO ref_images (name, file_path, file_size, created_at) VALUES (?, ?, 0, '') RETURNING id`,
    args: ['drawer', 'ref/drawer.png'],
  });
  refImageId = Number(ref.rows[0].id);
});

function layoutInput(overrides: Partial<Parameters<typeof layoutService.createLayout>[0]> = {}) {
  return {
    name: 'Drawer',
    gridX: 4,
    gridY: 4,
    widthMm: 168,
    depthMm: 168,
    placedItems: [
      { itemId: 'bins_standard:bin-1x1', x: 0, y: 0, width: 2, height: 2, rotation: 0 },
      { itemId: 'bin-2x1', x: 2, y: 0, width: 4, height: 2, rotation: 90 },
    ],
    ...overrides,
  };
}

function refPlacement(overrides: Record<string, unknown> = {}) {
  return {
    refImageId,
    name: 'drawer',
    x: 0, y: 0, width: 100, height: 100,
    opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
    ...overrides,
  };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('layout service', () => {
  describe('createLayout', () => {
    it('splits prefixed item ids and defaults bare ids to bins_standard', async () => {
      const created = await layoutService.createLayout(layoutInput());
      expect(created.placedItems.map(i => [i.libraryId, i.itemId, i.sortOrder])).toEqual([
        ['bins_standard', 'bin-1x1', 0],
        ['bins_standard', 'bin-2x1', 1],
      ]);
    });

    it('resolves the customer name and thumbnail url', async () => {
      const created = await layoutService.createLayout(layoutInput({ customerId }));
      expect(created.customerName).toBe('Acme');
      expect(created.thumbnailUrl).toMatch(new RegExp(`^/thumbnails/${created.id}\\?v=`));
    });

    it('still saves when thumbnail generation fails', async () => {
      generateThumbnail.mockRejectedValueOnce(new Error('sharp exploded'));
      const created = await layoutService.createLayout(layoutInput());
      expect(created.thumbnailUrl).toBeNull();
      expect(created.placedItems).toHaveLength(2);
    });

    it('stores warped path only when corners are present', async () => {
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const created = await layoutService.createLayout(layoutInput({
        refImagePlacements: [
          refPlacement({ corners, warpedImageUrl: '/warps/a.png' }),
          refPlacement({ warpedImageUrl: '/warps/ignored.png' }),
        ],
      }));
      const { refImagePlacements = [], referenceImages = [] } = await layoutService.getLayoutById(created.id);
      expect(referenceImages.map(r => r.name)).toEqual(['drawer', 'drawer']);
      expect(refImagePlacements.map(p => p.warpedImageUrl)).toEqual(['/warps/a.png', null]);
      expect(refImagePlacements[0]).toMatchObject({ corners, imageUrl: 'ref/drawer.png' });
    });
  });

  describe('getLayoutById', () => {
    it('throws NOT_FOUND for an unknown id', async () => {
      await expectAppError(layoutService.getLayoutById(999_999), ErrorCodes.NOT_FOUND);
    });
  });

  describe('getAllLayouts', () => {
    it('paginates newest first with a cursor', async () => {
      for (let i = 0; i < 3; i++) {
        await layoutService.createLayout(layoutInput({ name: `page-${i}`, customerId }));
      }
      const first = await layoutService.getAllLayouts(undefined, 2, customerId);
      expect(first.data).toHaveLength(2);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toBeDefined();

      const second = await layoutService.getAllLayouts(first.nextCursor, 100, customerId);
      const firstIds = new Set(first.data.map(l => l.id));
      expect(second.data.some(l => firstIds.has(l.id))).toBe(false);
      expect(second.hasMore).toBe(false);
      expect(second.nextCursor).toBeUndefined();
    });

    it('filters by customer', async () => {
      const result = await layoutService.getAllLayouts(undefined, 100, customerId);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.every(l => l.customerId === customerId)).toBe(true);
    });

    it('rejects a malformed cursor', async () => {
      await expectAppError(layoutService.getAllLayouts('not-a-cursor'), ErrorCodes.VALIDATION_ERROR);
    });
  });

  describe('updateLayout', () => {
    it('replaces items and keeps the customer when not provided', async () => {
      const created = await layoutService.createLayout(layoutInput({ customerId }));
      const updated = await layoutService.updateLayout(created.id, layoutInput({
        name: 'Renamed',
        placedItems: [{ itemId: 'lib:x', x: 1, y: 1, width: 2, height: 2, rotation: 0 }],
      }));
      expect(updated.name).toBe('Renamed');
      expect(updated.customerName).toBe('Acme');
      expect(updated.placedItems).toHaveLength(1);
      const loaded = await layoutService.getLayoutById(created.id);
      expect(loaded.placedItems.map(i => `${i.libraryId}:${i.itemId}`)).toEqual(['lib:x']);
    });

    it('rejects unknown ref images without touching existing data', async () => {
      const created = await layoutService.createLayout(layoutInput({ refImagePlacements: [refPlacement()] }));
      await expectAppError(
        layoutService.updateLayout(created.id, layoutInput({
          placedItems: [],
          refImagePlacements: [refPlacement({ refImageId: 424242 })],
        })),
        ErrorCodes.CONFLICT,
      );
      const loaded = await layoutService.getLayoutById(created.id);
      expect(loaded.placedItems).toHaveLength(2);
      expect(loaded.refImagePlacements).toHaveLength(1);
    });

    it('releases the previous warps after saving', async () => {
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const created = await layoutService.createLayout(layoutInput({
        refImagePlacements: [refPlacement({ corners, warpedImageUrl: '/warps/old.png' })],
      }));
      releaseWarps.mockClear();
      await layoutService.updateLayout(created.id, layoutInput());
      expect(releaseWarps).toHaveBeenCalledWith(['/warps/old.png']);
    });

    it('throws NOT_FOUND for an unknown id', async () => {
      await expectAppError(layoutService.updateLayout(999_999, layoutInput()), ErrorCodes.NOT_FOUND);
    });
  });

  describe('updateLayoutMeta', () => {
    it('updates only provided fields', async () => {
      const created = await layoutService.createLayout(layoutInput({ description: 'keep me' }));
      const updated = await layoutService.updateLayoutMeta(created.id, { name: 'Meta', customerId });
      expect(updated).toMatchObject({ name: 'Meta', description: 'keep me', customerName: 'Acme' });
    });

    it('throws NOT_FOUND for an unknown id', async () => {
      await expectAppError(layoutService.updateLayoutMeta(999_999, { name: 'x' }), ErrorCodes.NOT_FOUND);
    });
  });

  describe('deleteLayout', () => {
    it('removes the layout and its items', async () => {
      const created = await layoutService.createLayout(layoutInput());
      await layoutService.deleteLayout(created.id);
      await expectAppError(layoutService.getLayoutById(created.id), ErrorCodes.NOT_FOUND);
      const items = await testClient.execute({
        sql: 'SELECT COUNT(*) AS n FROM placed_items WHERE layout_id = ?',
        args: [created.id],
      });
      expect(Number(items.rows[0].n)).toBe(0);
    });

    it('throws NOT_FOUND for an unknown id', async () => {
      await expectAppError(layoutService.deleteLayout(999_999), ErrorCodes.NOT_FOUND);
    });
  });

  describe('cloneLayout', () => {
    it('copies items, ref placements and customer under a new name', async () => {
      const created = await layoutService.createLayout(layoutInput({
        customerId,
        refImagePlacements: [refPlacement()],
      }));
      const copy = await layoutService.cloneLayout(created.id);
      expect(copy.id).not.toBe(created.id);
      expect(copy.name).toBe('Copy of Drawer');
      expect(copy.customerName).toBe('Acme');
      expect(copy.placedItems.map(i => i.itemId)).toEqual(created.placedItems.map(i => i.itemId));
      expect(copy.refImagePlacements).toHaveLength(1);
    });

    it('throws NOT_FOUND for an unknown id', async () => {
      await expectAppError(layoutService.cloneLayout(999_999), ErrorCodes.NOT_FOUND);
    });
  });
});
