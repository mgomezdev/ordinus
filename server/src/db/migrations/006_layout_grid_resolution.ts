import type { Client } from '@libsql/client';

export const version = 6;
export const name = 'layout_grid_resolution';

const LEGACY_RESOLUTION = 1;
const HALF_CELL_RESOLUTION = 2;

/**
 * Placed-item geometry moves from whole units to integer half-cells. Existing layouts are
 * rescaled in place and tagged with the new resolution; the tag keeps the step idempotent.
 */
export async function up(client: Client): Promise<void> {
  await client.execute(`ALTER TABLE layouts ADD COLUMN grid_resolution INTEGER NOT NULL DEFAULT ${LEGACY_RESOLUTION}`);
  await client.execute({
    sql: `UPDATE placed_items
          SET x = x * ?, y = y * ?, width = width * ?, height = height * ?
          WHERE layout_id IN (SELECT id FROM layouts WHERE grid_resolution = ?)`,
    args: [HALF_CELL_RESOLUTION, HALF_CELL_RESOLUTION, HALF_CELL_RESOLUTION, HALF_CELL_RESOLUTION, LEGACY_RESOLUTION],
  });
  await client.execute({
    sql: `UPDATE layouts SET grid_resolution = ? WHERE grid_resolution = ?`,
    args: [HALF_CELL_RESOLUTION, LEGACY_RESOLUTION],
  });
}

export async function down(client: Client): Promise<void> {
  await client.execute({
    sql: `UPDATE placed_items
          SET x = x / ?, y = y / ?, width = MAX(width / ?, 1), height = MAX(height / ?, 1)
          WHERE layout_id IN (SELECT id FROM layouts WHERE grid_resolution = ?)`,
    args: [HALF_CELL_RESOLUTION, HALF_CELL_RESOLUTION, HALF_CELL_RESOLUTION, HALF_CELL_RESOLUTION, HALF_CELL_RESOLUTION],
  });
  await client.execute(`ALTER TABLE layouts DROP COLUMN grid_resolution`);
}
