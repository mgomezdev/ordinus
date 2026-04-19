import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { runMigrations } from '../db/migrate.js';
import type { BOMItem } from '@gridfinity/shared';

// We test the pure extraction logic without spawning real subprocesses
import { extractUniqueConfigs, formatBomGeneration, buildGenerateParams } from './bomGeneration.service.js';
import type { UniqueConfig } from './bomGeneration.service.js';

let client: ReturnType<typeof createClient>;

beforeEach(async () => {
  client = createClient({ url: ':memory:' });
  await runMigrations(client);
  await client.execute(
    `INSERT INTO users (id, email, username, password_hash) VALUES (1, 'a@b.com', 'admin', 'hash')`,
  );
  await client.execute(
    `INSERT INTO layouts (id, user_id, name, grid_x, grid_y, width_mm, depth_mm, created_at, updated_at)
     VALUES (1, 1, 'Test Layout', 4, 4, 168, 168, datetime('now'), datetime('now'))`,
  );
});

describe('extractUniqueConfigs', () => {
  it('groups identical items and sums quantities', () => {
    const bomItems = [
      { itemId: 'standard-2x3', name: 'Bin', widthUnits: 2, heightUnits: 3,
        color: '#000', categories: [], quantity: 2, customization: undefined },
      { itemId: 'standard-2x3', name: 'Bin', widthUnits: 2, heightUnits: 3,
        color: '#000', categories: [], quantity: 1, customization: undefined },
    ];
    const configs = extractUniqueConfigs(bomItems);
    expect(configs).toHaveLength(1);
    expect(configs[0].qty).toBe(3);
    expect(configs[0].widthUnits).toBe(2);
    expect(configs[0].heightUnits).toBe(3);
  });

  it('separates items with different customizations', () => {
    const bomItems: BOMItem[] = [
      { itemId: 'bin', name: 'Bin', widthUnits: 2, heightUnits: 2,
        color: '#000', categories: [], quantity: 1,
        customization: { wallPattern: 'none', lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none', height: 8 } },
      { itemId: 'bin', name: 'Bin', widthUnits: 2, heightUnits: 2,
        color: '#000', categories: [], quantity: 1,
        customization: { wallPattern: 'none', lipStyle: 'none', fingerSlide: 'none', wallCutout: 'none', height: 10 } },
    ];
    const configs = extractUniqueConfigs(bomItems);
    expect(configs).toHaveLength(2);
  });

  it('treats undefined customization same as default', () => {
    const bomItems: BOMItem[] = [
      { itemId: 'bin', name: 'Bin', widthUnits: 1, heightUnits: 1,
        color: '#000', categories: [], quantity: 2, customization: undefined },
      { itemId: 'bin', name: 'Bin', widthUnits: 1, heightUnits: 1,
        color: '#000', categories: [], quantity: 1,
        customization: { wallPattern: 'none', lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none', height: 8 } },
    ];
    const configs = extractUniqueConfigs(bomItems);
    expect(configs).toHaveLength(1);
    expect(configs[0].qty).toBe(3);
  });

  it('returns empty array for empty BOM', () => {
    expect(extractUniqueConfigs([])).toHaveLength(0);
  });
});

const baseConfig = (overrides: Partial<UniqueConfig['customization']> = {}): UniqueConfig => ({
  widthUnits: 2,
  heightUnits: 3,
  qty: 1,
  filename: 'bin_2x3x8.stl',
  customization: {
    wallPattern: 'none',
    lipStyle: 'normal',
    fingerSlide: 'none',
    wallCutout: 'none',
    height: 8,
    ...overrides,
  },
});

describe('buildGenerateParams', () => {
  it('maps dimensions to OpenSCAD array format', () => {
    const params = buildGenerateParams(baseConfig());
    expect(params.width).toEqual([2, 0]);
    expect(params.depth).toEqual([3, 0]);
    expect(params.height).toEqual([8, 0]);
  });

  it('always sets label_style to disabled', () => {
    expect(buildGenerateParams(baseConfig()).label_style).toBe('disabled');
  });

  it('passes lip_style and fingerslide through', () => {
    const params = buildGenerateParams(baseConfig({ lipStyle: 'reduced', fingerSlide: 'rounded' }));
    expect(params.lip_style).toBe('reduced');
    expect(params.fingerslide).toBe('rounded');
  });

  it('does not set wallpattern_enabled when wallPattern is none', () => {
    const params = buildGenerateParams(baseConfig({ wallPattern: 'none' }));
    expect(params.wallpattern_enabled).toBeUndefined();
  });

  it('enables wallpattern with style when wallPattern is set', () => {
    const params = buildGenerateParams(baseConfig({ wallPattern: 'hexgrid' }));
    expect(params.wallpattern_enabled).toBe(true);
    expect(params.wallpattern_style).toBe('hexgrid');
  });

  it('sets wallcutout_enabled to false when wallCutout is none', () => {
    const params = buildGenerateParams(baseConfig({ wallCutout: 'none' }));
    expect(params.wallcutout_enabled).toBe(false);
  });

  it('sets wallcutout_enabled and vertical walls for vertical cutout', () => {
    const params = buildGenerateParams(baseConfig({ wallCutout: 'vertical' }));
    expect(params.wallcutout_enabled).toBe(true);
    expect(params.wallcutout_walls).toEqual([1, 0, 1, 0]);
  });

  it('sets horizontal walls for horizontal cutout', () => {
    const params = buildGenerateParams(baseConfig({ wallCutout: 'horizontal' }));
    expect(params.wallcutout_enabled).toBe(true);
    expect(params.wallcutout_walls).toEqual([0, 1, 0, 1]);
  });

  it('sets all walls for both cutout', () => {
    const params = buildGenerateParams(baseConfig({ wallCutout: 'both' }));
    expect(params.wallcutout_enabled).toBe(true);
    expect(params.wallcutout_walls).toEqual([1, 1, 1, 1]);
  });
});

describe('buildGenerateParams with gridfinityExtendedParams', () => {
  const DEFAULT_CUSTOMIZATION: UniqueConfig['customization'] = {
    wallPattern: 'none',
    lipStyle: 'normal',
    fingerSlide: 'none',
    wallCutout: 'none',
    height: 8,
  };

  it('passes through non-BinCustomization params from gridfinityExtendedParams', () => {
    const cfg: UniqueConfig = {
      widthUnits: 1,
      heightUnits: 1,
      customization: { ...DEFAULT_CUSTOMIZATION },
      qty: 1,
      filename: 'bin_1x1x8.stl',
      gridfinityExtendedParams: { label_style: 'normal', label_walls: [0, 1, 0, 0] },
    };
    const params = buildGenerateParams(cfg);
    expect(params.label_style).toBe('normal');
    expect(params.label_walls).toEqual([0, 1, 0, 0]);
  });

  it('BinCustomization lip_style overrides gridfinityExtendedParams lip_style', () => {
    const cfg: UniqueConfig = {
      widthUnits: 1,
      heightUnits: 1,
      customization: { ...DEFAULT_CUSTOMIZATION, lipStyle: 'reduced' },
      qty: 1,
      filename: 'bin_1x1x8.stl',
      gridfinityExtendedParams: { lip_style: 'none' },
    };
    const params = buildGenerateParams(cfg);
    expect(params.lip_style).toBe('reduced');
  });

  it('BinCustomization height overrides gridfinityExtendedParams height', () => {
    const cfg: UniqueConfig = {
      widthUnits: 2,
      heightUnits: 2,
      customization: { ...DEFAULT_CUSTOMIZATION, height: 6 },
      qty: 1,
      filename: 'bin_2x2x6.stl',
      gridfinityExtendedParams: { height: [4, 0] },
    };
    const params = buildGenerateParams(cfg);
    expect(params.height).toEqual([6, 0]);
  });

  it('system default label_style: disabled is overridden by gridfinityExtendedParams', () => {
    const cfg: UniqueConfig = {
      widthUnits: 1,
      heightUnits: 1,
      customization: { ...DEFAULT_CUSTOMIZATION },
      qty: 1,
      filename: 'bin_1x1x8.stl',
      gridfinityExtendedParams: { label_style: 'normal' },
    };
    const params = buildGenerateParams(cfg);
    expect(params.label_style).toBe('normal');
  });

  it('uses label_style: disabled when no gridfinityExtendedParams override', () => {
    const cfg: UniqueConfig = {
      widthUnits: 1,
      heightUnits: 1,
      customization: { ...DEFAULT_CUSTOMIZATION },
      qty: 1,
      filename: 'bin_1x1x8.stl',
    };
    const params = buildGenerateParams(cfg);
    expect(params.label_style).toBe('disabled');
  });
});

describe('extractUniqueConfigs with gridfinityExtendedParams', () => {
  it('groups items with same dimensions, customization, and gridfinityExtendedParams together', () => {
    const items: BOMItem[] = [
      {
        itemId: 'bins_labeled:bin-1x1-labeled',
        name: 'A',
        widthUnits: 1,
        heightUnits: 1,
        color: '#fff',
        categories: [],
        quantity: 2,
        gridfinityExtendedParams: { label_style: 'normal' },
      },
      {
        itemId: 'bins_labeled:bin-1x1-labeled',
        name: 'A',
        widthUnits: 1,
        heightUnits: 1,
        color: '#fff',
        categories: [],
        quantity: 3,
        gridfinityExtendedParams: { label_style: 'normal' },
      },
    ];
    const configs = extractUniqueConfigs(items);
    expect(configs).toHaveLength(1);
    expect(configs[0].qty).toBe(5);
  });

  it('separates items with same dimensions but different gridfinityExtendedParams', () => {
    const items: BOMItem[] = [
      {
        itemId: 'bins_labeled:bin-1x1-labeled',
        name: 'Labeled',
        widthUnits: 1,
        heightUnits: 1,
        color: '#fff',
        categories: [],
        quantity: 1,
        gridfinityExtendedParams: { label_style: 'normal' },
      },
      {
        itemId: 'bins_standard:bin-1x1',
        name: 'Standard',
        widthUnits: 1,
        heightUnits: 1,
        color: '#fff',
        categories: [],
        quantity: 1,
        gridfinityExtendedParams: {},
      },
    ];
    const configs = extractUniqueConfigs(items);
    expect(configs).toHaveLength(2);
  });
});

describe('formatBomGeneration', () => {
  it('formats a generation row correctly', () => {
    const row = {
      id: 1,
      layoutId: 1,
      status: 'ready' as const,
      fileManifest: JSON.stringify([{ filename: 'bin_2x3x8.stl', widthUnits: 2, heightUnits: 3, qty: 1 }]),
      threeMfPath: '/path/to/bom.3mf',
      generatedAt: '2024-01-01T00:00:00Z',
      errorMessage: null,
    };
    const result = formatBomGeneration(row);
    expect(result.id).toBe(1);
    expect(result.layoutId).toBe(1);
    expect(result.status).toBe('ready');
    expect(result.fileManifest).toHaveLength(1);
  });

  it('formats a pending row', () => {
    const row = {
      id: 1,
      layoutId: 1,
      status: 'pending',
      fileManifest: null,
      threeMfPath: null,
      generatedAt: null,
      errorMessage: null,
    };
    const result = formatBomGeneration(row);
    expect(result.status).toBe('pending');
    expect(result.fileManifest).toBeNull();
  });
});
