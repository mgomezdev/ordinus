import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { BOMItem } from '@gridfinity/shared';

// Use in-memory DB for resolveItemSources tests
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

const { runMigrations } = await import('../db/migrate.js');
const { client: testClient } = await import('../db/connection.js');
import {
  resolveItemSources,
  formatBomGeneration,
  buildGenerateParams,
} from './bomGeneration.service.js';
import type { UniqueConfig } from './bomGeneration.service.js';

// ── Seed helper ──────────────────────────────────────────────────────────────

async function seedLibrary(id: string, baseModelPath: string | null): Promise<void> {
  const now = new Date().toISOString();
  await testClient.execute({
    sql: `INSERT OR IGNORE INTO libraries (id, name, version, is_active, sort_order, created_at, updated_at, base_model_path)
          VALUES (?, ?, '1.0.0', 1, 0, ?, ?, ?)`,
    args: [id, id, now, now, baseModelPath],
  });
}

async function seedItem(libraryId: string, itemId: string, stlFile: string | null): Promise<void> {
  const now = new Date().toISOString();
  await testClient.execute({
    sql: `INSERT OR IGNORE INTO library_items (library_id, id, name, width_units, height_units, color, is_active, sort_order, created_at, updated_at, stl_file)
          VALUES (?, ?, ?, 1, 1, '#000', 1, 0, ?, ?, ?)`,
    args: [libraryId, itemId, itemId, now, now, stlFile],
  });
}

const BASE_BOM_ITEM: Omit<BOMItem, 'libraryId' | 'itemId'> = {
  name: 'Test Bin',
  widthUnits: 2,
  heightUnits: 3,
  color: '#000',
  categories: [],
  quantity: 1,
};

beforeAll(async () => {
  await runMigrations(testClient);
  await seedLibrary('gen-lib', '/data/models/gen-lib/base.scad');
  await seedLibrary('static-lib', null);
  await seedLibrary('no-model-lib', null);
  await seedItem('gen-lib', 'bin-2x3', null);
  await seedItem('static-lib', 'utensil-1x3', '/data/static-stls/static-lib/utensil.stl');
  await seedItem('no-model-lib', 'unknown-item', null);
});

afterAll(() => testClient.close());

// ── resolveItemSources ───────────────────────────────────────────────────────

describe('resolveItemSources', () => {
  it('item with stl_file in DB goes to staticConfigs', async () => {
    const items: BOMItem[] = [{ ...BASE_BOM_ITEM, libraryId: 'static-lib', itemId: 'utensil-1x3' }];
    const { staticConfigs, uniqueConfigs } = await resolveItemSources(items);
    expect(staticConfigs).toHaveLength(1);
    expect(uniqueConfigs).toHaveLength(0);
    expect(staticConfigs[0].stlSourcePath).toBe('/data/static-stls/static-lib/utensil.stl');
    expect(staticConfigs[0].qty).toBe(1);
  });

  it('item without stl_file but library has base model goes to uniqueConfigs', async () => {
    const items: BOMItem[] = [{ ...BASE_BOM_ITEM, libraryId: 'gen-lib', itemId: 'bin-2x3' }];
    const { staticConfigs, uniqueConfigs } = await resolveItemSources(items);
    expect(staticConfigs).toHaveLength(0);
    expect(uniqueConfigs).toHaveLength(1);
    expect(uniqueConfigs[0].baseModelPath).toBe('/data/models/gen-lib/base.scad');
    expect(uniqueConfigs[0].widthUnits).toBe(2);
    expect(uniqueConfigs[0].heightUnits).toBe(3);
  });

  it('mixes static and generated items correctly', async () => {
    const items: BOMItem[] = [
      { ...BASE_BOM_ITEM, libraryId: 'gen-lib', itemId: 'bin-2x3' },
      { ...BASE_BOM_ITEM, libraryId: 'static-lib', itemId: 'utensil-1x3' },
    ];
    const { staticConfigs, uniqueConfigs } = await resolveItemSources(items);
    expect(staticConfigs).toHaveLength(1);
    expect(uniqueConfigs).toHaveLength(1);
  });

  it('deduplicates generated items with same dimensions+customization+baseModel', async () => {
    const items: BOMItem[] = [
      { ...BASE_BOM_ITEM, libraryId: 'gen-lib', itemId: 'bin-2x3', quantity: 2 },
      { ...BASE_BOM_ITEM, libraryId: 'gen-lib', itemId: 'bin-2x3', quantity: 3 },
    ];
    const { uniqueConfigs } = await resolveItemSources(items);
    expect(uniqueConfigs).toHaveLength(1);
    expect(uniqueConfigs[0].qty).toBe(5);
  });

  it('throws when item has no static STL and library has no base model', async () => {
    const items: BOMItem[] = [{ ...BASE_BOM_ITEM, libraryId: 'no-model-lib', itemId: 'unknown-item' }];
    await expect(resolveItemSources(items)).rejects.toThrow('no base model');
  });
});

// ── formatBomGeneration ──────────────────────────────────────────────────────

describe('formatBomGeneration', () => {
  it('maps layoutId and status correctly', () => {
    const row = {
      id: 1, layoutId: 42, status: 'ready', fileManifest: null,
      threeMfPath: null, generatedAt: null, errorMessage: null, themisProjectId: null,
    };
    const result = formatBomGeneration(row);
    expect(result.layoutId).toBe(42);
    expect(result.status).toBe('ready');
    expect(result.fileManifest).toBeNull();
  });
});

// ── buildGenerateParams ──────────────────────────────────────────────────────

const cfg = {
  widthUnits: 2,
  heightUnits: 3,
  qty: 1,
  filename: 'bin_2x3x8.stl',
  baseModelPath: '/data/models/gen-lib/base.scad',
};

const DEFAULT_WC = { front: false, back: false, left: false, right: false };

function makeCustomization(overrides: Partial<UniqueConfig['customization']> = {}): UniqueConfig {
  return {
    ...cfg,
    customization: {
      wallPatternEnabled: false,
      wallPattern: 'grid',
      lipStyle: 'normal',
      fingerSlide: 'none',
      wallCutout: DEFAULT_WC,
      height: 8,
      ...overrides,
    },
  };
}

// Keep baseConfig as alias for backward compat with existing tests
const baseConfig = makeCustomization;

describe('buildGenerateParams', () => {
  it('maps dimensions to OpenSCAD array format', () => {
    const params = buildGenerateParams(baseConfig());
    expect(params.width).toEqual([2, 0]);
    expect(params.depth).toEqual([3, 0]);
    expect(params.height).toEqual([8, 0]);
  });

  it('customization height overrides parameters height', () => {
    const cfg: UniqueConfig = { ...baseConfig({ height: 8 }), parameters: { height: [4, 0], filled_in: 'enabled' } };
    const params = buildGenerateParams(cfg);
    expect(params.height).toEqual([8, 0]);
    expect(params.filled_in).toBe('enabled');
  });

  it('passes non-height parameters through', () => {
    const cfg: UniqueConfig = { ...baseConfig({ height: 6 }), parameters: { filled_in: 'enabled' } };
    const params = buildGenerateParams(cfg);
    expect(params.height).toEqual([6, 0]);
    expect(params.filled_in).toBe('enabled');
  });

  it('always sets label_style to disabled', () => {
    expect(buildGenerateParams(baseConfig()).label_style).toBe('disabled');
  });

  it('passes lip_style and fingerslide through', () => {
    const params = buildGenerateParams(baseConfig({ lipStyle: 'reduced', fingerSlide: 'rounded' }));
    expect(params.lip_style).toBe('reduced');
    expect(params.fingerslide).toBe('rounded');
  });

  it('does not set wallpattern_enabled when wallPatternEnabled is false', () => {
    expect(buildGenerateParams(baseConfig({ wallPatternEnabled: false })).wallpattern_enabled).toBeUndefined();
  });

  it('enables wallpattern with style when wallPatternEnabled is true', () => {
    const params = buildGenerateParams(baseConfig({ wallPatternEnabled: true, wallPattern: 'hexgrid' }));
    expect(params.wallpattern_enabled).toBe(true);
    expect(params.wallpattern_style).toBe('hexgrid');
  });

});

describe('buildGenerateParams — wall cutout', () => {
  it('no walls → enabled=false, all zeros', () => {
    const params = buildGenerateParams(makeCustomization({ wallCutout: { front: false, back: false, left: false, right: false } }));
    expect(params.wallcutout_enabled).toBe(false);
    expect(params.wallcutout_walls).toEqual([0, 0, 0, 0]);
  });

  it('front only → enabled=true, walls=[-2,0,0,0]', () => {
    const params = buildGenerateParams(makeCustomization({ wallCutout: { front: true, back: false, left: false, right: false } }));
    expect(params.wallcutout_enabled).toBe(true);
    expect(params.wallcutout_walls).toEqual([-2, 0, 0, 0]);
  });

  it('back only → walls=[0,-2,0,0]', () => {
    const params = buildGenerateParams(makeCustomization({ wallCutout: { front: false, back: true, left: false, right: false } }));
    expect(params.wallcutout_enabled).toBe(true);
    expect(params.wallcutout_walls).toEqual([0, -2, 0, 0]);
  });

  it('left only → walls=[0,0,-2,0]', () => {
    const params = buildGenerateParams(makeCustomization({ wallCutout: { front: false, back: false, left: true, right: false } }));
    expect(params.wallcutout_enabled).toBe(true);
    expect(params.wallcutout_walls).toEqual([0, 0, -2, 0]);
  });

  it('right only → walls=[0,0,0,-2]', () => {
    const params = buildGenerateParams(makeCustomization({ wallCutout: { front: false, back: false, left: false, right: true } }));
    expect(params.wallcutout_enabled).toBe(true);
    expect(params.wallcutout_walls).toEqual([0, 0, 0, -2]);
  });

  it('front + left → walls=[-2,0,-2,0]', () => {
    const params = buildGenerateParams(makeCustomization({ wallCutout: { front: true, back: false, left: true, right: false } }));
    expect(params.wallcutout_enabled).toBe(true);
    expect(params.wallcutout_walls).toEqual([-2, 0, -2, 0]);
  });

  it('all walls → enabled=true, all -2', () => {
    const params = buildGenerateParams(makeCustomization({ wallCutout: { front: true, back: true, left: true, right: true } }));
    expect(params.wallcutout_enabled).toBe(true);
    expect(params.wallcutout_walls).toEqual([-2, -2, -2, -2]);
  });
});
