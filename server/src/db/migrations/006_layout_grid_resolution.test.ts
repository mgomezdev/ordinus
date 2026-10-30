import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import * as m001 from './001_baseline.js';
import * as m002 from './002_settings.js';
import * as m003 from './003_themis_api_key.js';
import * as m004 from './004_ref_image_alignment.js';
import * as m005 from './005_placed_items_custom_spec.js';
import * as m006 from './006_layout_grid_resolution.js';

async function insertLayout(client: Client, id: number): Promise<void> {
  await client.execute({
    sql: `INSERT INTO layouts (id, name, grid_x, grid_y, width_mm, depth_mm, created_at, updated_at)
          VALUES (?, 'L', 6, 6, 252, 252, '', '')`,
    args: [id],
  });
}

async function insertItem(client: Client, layoutId: number, geometry: number[]): Promise<void> {
  await client.execute({
    sql: `INSERT INTO placed_items (layout_id, library_id, item_id, x, y, width, height, rotation, sort_order)
          VALUES (?, 'bins_standard', 'bin-3x2', ?, ?, ?, ?, 0, 0)`,
    args: [layoutId, ...geometry],
  });
}

async function geometryOf(client: Client, layoutId: number): Promise<number[]> {
  const r = await client.execute({ sql: `SELECT x, y, width, height FROM placed_items WHERE layout_id = ?`, args: [layoutId] });
  const row = r.rows[0];
  return [row['x'], row['y'], row['width'], row['height']].map(Number);
}

describe('006 layout grid resolution', () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ':memory:' });
    for (const m of [m001, m002, m003, m004, m005]) await m.up(client);
    await insertLayout(client, 1);
    await insertItem(client, 1, [1, 2, 3, 2]);
    await insertLayout(client, 2);
    await insertItem(client, 2, [0, 0, 1, 1]);
  });

  it('rescales every existing layout to half-cells and tags it', async () => {
    await m006.up(client);

    expect(await geometryOf(client, 1)).toEqual([2, 4, 6, 4]);
    expect(await geometryOf(client, 2)).toEqual([0, 0, 2, 2]);
    const rows = await client.execute(`SELECT DISTINCT grid_resolution FROM layouts`);
    expect(rows.rows.map(r => Number(r['grid_resolution']))).toEqual([2]);
  });

  it('does not rescale layouts already stored in half-cells', async () => {
    await m006.up(client);
    await insertLayout(client, 3);
    await client.execute(`UPDATE layouts SET grid_resolution = 2 WHERE id = 3`);
    await insertItem(client, 3, [5, 1, 5, 3]);

    await m006.up(client).catch(() => undefined);

    expect(await geometryOf(client, 3)).toEqual([5, 1, 5, 3]);
  });

  it('rolls back to whole units', async () => {
    await m006.up(client);
    await m006.down(client);

    expect(await geometryOf(client, 1)).toEqual([1, 2, 3, 2]);
    const cols = await client.execute(`PRAGMA table_info(layouts)`);
    expect(cols.rows.map(r => r['name'])).not.toContain('grid_resolution');
  });
});
