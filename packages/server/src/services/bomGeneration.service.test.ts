import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { runMigrations } from '../db/migrate.js';
import type { BOMItem } from '@gridfinity/shared';

// We test the pure extraction logic without spawning real subprocesses
import { extractUniqueConfigs, formatBomGeneration } from './bomGeneration.service.js';

let client: ReturnType<typeof createClient>;

beforeEach(async () => {
  client = createClient({ url: ':memory:' });
  await runMigrations(client);
  await client.execute(
    `INSERT INTO users (id, email, username, password_hash) VALUES (1, 'a@b.com', 'admin', 'hash')`,
  );
  await client.execute(
    `INSERT INTO bom_submissions (id, grid_x, grid_y, width_mm, depth_mm, total_items, total_unique, export_json, created_at)
     VALUES (1, 4, 4, 168, 168, 3, 2, '[]', datetime('now'))`,
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

describe('formatBomGeneration', () => {
  it('formats a pending row', () => {
    const row = {
      id: 1, submissionId: 1, status: 'pending',
      fileManifest: null, threeMfPath: null, generatedAt: null, errorMessage: null,
    };
    const result = formatBomGeneration(row);
    expect(result.status).toBe('pending');
    expect(result.fileManifest).toBeNull();
  });

  it('parses fileManifest JSON string', () => {
    const manifest = [{ filename: 'bin_2x3x8.stl', widthUnits: 2, heightUnits: 3, qty: 2, customization: null }];
    const row = {
      id: 1, submissionId: 1, status: 'ready',
      fileManifest: JSON.stringify(manifest),
      threeMfPath: '/data/generated/bom-1/bom-1.3mf',
      generatedAt: '2026-04-17T00:00:00Z',
      errorMessage: null,
    };
    const result = formatBomGeneration(row);
    expect(result.fileManifest).toHaveLength(1);
    expect(result.fileManifest![0].filename).toBe('bin_2x3x8.stl');
  });
});
