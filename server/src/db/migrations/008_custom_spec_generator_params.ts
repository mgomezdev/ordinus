import type { Client } from '@libsql/client';

export const version = 8;
export const name = 'custom_spec_generator_params';

type Overrides = Record<string, unknown>;

const MAGNET_HEIGHT = 2.4;
const SCREW_DIAMETER = 3;

const RENAMED: Record<string, string> = {
  position: 'render_position',
  sliding_min_wallThickness: 'sliding_lid_min_wall_thickness',
  sliding_min_support: 'sliding_lid_min_support',
  sliding_clearance: 'sliding_lid_clearance',
  wallpattern_hole_spacing: 'wallpattern_strength',
  wallpattern_voronoi_noise: 'wallpattern_pattern_voronoi_noise',
  wallpattern_voronoi_radius: 'wallpattern_hole_radius',
};

/** Dropped by the generator, or folded into another parameter (center magnet thickness). */
const REMOVED = new Set(['zClearance', 'cutx', 'cuty', 'label_relief', 'center_magnet_thickness']);
const CUTOUT_SHARED = ['width', 'angle', 'height', 'corner_radius'] as const;

function positive(value: unknown): value is number {
  return typeof value === 'number' && value > 0;
}

function isOff(value: unknown): boolean {
  return value === false || value === 'false';
}

function cutoutMode(first: boolean, second: boolean, firstOnly: string, secondOnly: string): string {
  if (first && second) return 'enabled';
  if (first) return firstOnly;
  return second ? secondOnly : 'disabled';
}

function migrateCutout(old: Overrides, out: Overrides): void {
  const walls = Array.isArray(old['wallcutout_walls']) ? (old['wallcutout_walls'] as number[]) : [0, 0, 0, 0];
  const on = old['wallcutout_enabled'] === true;
  const [front, back, left, right] = walls.map(w => on && w !== 0);
  const vertical = cutoutMode(front, back, 'frontonly', 'backonly');
  const horizontal = cutoutMode(right, left, 'leftonly', 'rightonly');
  if (vertical !== 'disabled') out['wallcutout_vertical'] = vertical;
  if (horizontal !== 'disabled') out['wallcutout_horizontal'] = horizontal;
  for (const field of CUTOUT_SHARED) {
    const value = old[`wallcutout_${field}`];
    if (value === undefined) continue;
    if (vertical !== 'disabled') out[`wallcutout_vertical_${field}`] = value;
    if (horizontal !== 'disabled') out[`wallcutout_horizontal_${field}`] = value;
  }
}

/** Maps the overrides of a custom bin saved against the previous generator onto the current parameter names. */
export function migrateLegacyOverrides(old: Overrides): Overrides {
  const out: Overrides = {};
  for (const [key, value] of Object.entries(old)) {
    if (key.startsWith('wallcutout_') && !key.includes('vertical') && !key.includes('horizontal')) continue;
    if (REMOVED.has(key)) continue;
    if (key in RENAMED) out[RENAMED[key]] = value;
    else if (key === 'magnet_diameter') {
      if (positive(value)) Object.assign(out, { enable_magnets: true, magnet_size: [value, MAGNET_HEIGHT] });
    } else if (key === 'screw_depth') {
      if (positive(value)) Object.assign(out, { enable_screws: true, screw_size: [SCREW_DIAMETER, value] });
    } else if (key === 'center_magnet_diameter') {
      const thickness = old['center_magnet_thickness'];
      out['center_magnet_size'] = [value, typeof thickness === 'number' ? thickness : 0];
    } else if (key === 'half_pitch') {
      if (isOff(value)) out['sub_pitch'] = 1;
    } else if (key === 'label_walls' && Array.isArray(value) && value.length === 4) {
      const [front, back, left, right] = value as number[];
      out['label_walls'] = [back, front, left, right];
    } else if (key === 'flat_base') {
      if (value === true) out['flat_base'] = 'gridfinity';
    } else if (key === 'box_corner_attachments_only') {
      if (value === false) out[key] = 'disabled';
    } else if (key === 'extension_x_enabled' || key === 'extension_y_enabled') {
      if (value === true) out[key] = 'front';
    } else if (key === 'wallpattern_hole_size') {
      out['wallpattern_cell_size'] = [value, value];
    } else if (key === 'chamber_wall_thickness' && typeof value === 'number') {
      out[key] = [value, value];
    } else out[key] = value;
  }
  if (old['center_magnet_diameter'] === undefined && positive(old['center_magnet_thickness'])) {
    out['center_magnet_size'] = [0, old['center_magnet_thickness']];
  }
  migrateCutout(old, out);
  return out;
}

function migrateSpecJson(json: string): string {
  const spec = JSON.parse(json) as { overrides?: Overrides };
  if (!spec.overrides) return json;
  return JSON.stringify({ ...spec, overrides: migrateLegacyOverrides(spec.overrides) });
}

async function migrateTable(client: Client, table: string, idColumn: string): Promise<void> {
  const rows = await client.execute(`SELECT ${idColumn} AS id, custom_spec FROM ${table} WHERE custom_spec IS NOT NULL`);
  for (const row of rows.rows) {
    await client.execute({
      sql: `UPDATE ${table} SET custom_spec = ? WHERE ${idColumn} = ?`,
      args: [migrateSpecJson(String(row['custom_spec'])), row['id'] as string | number],
    });
  }
}

/**
 * The generator moved to the upstream gridfinity_extended parameter set. Saved custom bins carry
 * their overrides by parameter name, so rewrite them once; the rewrite leaves current names untouched.
 */
export async function up(client: Client): Promise<void> {
  await migrateTable(client, 'placed_items', 'id');
  await migrateTable(client, 'favorites', 'id');
}

/** The old parameter names cannot be reconstructed, so rolling back keeps the migrated specs. */
export async function down(): Promise<void> {
  return;
}
