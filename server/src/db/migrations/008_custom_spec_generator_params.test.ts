import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import * as m001 from './001_baseline.js';
import * as m002 from './002_settings.js';
import * as m003 from './003_themis_api_key.js';
import * as m004 from './004_ref_image_alignment.js';
import * as m005 from './005_placed_items_custom_spec.js';
import * as m006 from './006_layout_grid_resolution.js';
import * as m007 from './007_favorites_custom_spec.js';
import * as m008 from './008_custom_spec_generator_params.js';
import { migrateLegacyOverrides } from './008_custom_spec_generator_params.js';

describe('migrateLegacyOverrides', () => {
  it('turns magnet and screw sizes into enable flags plus size arrays', () => {
    expect(migrateLegacyOverrides({ magnet_diameter: 6.5, screw_depth: 8 })).toEqual({
      enable_magnets: true, magnet_size: [6.5, 2.4], enable_screws: true, screw_size: [3, 8],
    });
  });

  it('drops zero-valued magnet and screw sizes', () => {
    expect(migrateLegacyOverrides({ magnet_diameter: 0, screw_depth: 0 })).toEqual({});
  });

  it('combines the center magnet diameter and thickness', () => {
    expect(migrateLegacyOverrides({ center_magnet_diameter: 10, center_magnet_thickness: 2 })).toEqual({ center_magnet_size: [10, 2] });
    expect(migrateLegacyOverrides({ center_magnet_diameter: 10 })).toEqual({ center_magnet_size: [10, 0] });
  });

  it('maps half pitch off to sub_pitch 1 and drops half pitch on (the new default)', () => {
    expect(migrateLegacyOverrides({ half_pitch: false })).toEqual({ sub_pitch: 1 });
    expect(migrateLegacyOverrides({ half_pitch: 'false' })).toEqual({ sub_pitch: 1 });
    expect(migrateLegacyOverrides({ half_pitch: true })).toEqual({});
  });

  it('swaps the front and back entries of label_walls', () => {
    expect(migrateLegacyOverrides({ label_style: 'normal', label_walls: [1, 0, 1, 0] })).toEqual({ label_style: 'normal', label_walls: [0, 1, 1, 0] });
  });

  it('renames the sliding lid parameters', () => {
    expect(migrateLegacyOverrides({ sliding_min_wallThickness: 2, sliding_min_support: 1, sliding_clearance: 0.2 })).toEqual({
      sliding_lid_min_wall_thickness: 2, sliding_lid_min_support: 1, sliding_lid_clearance: 0.2,
    });
  });

  it('converts booleans that became enums', () => {
    expect(migrateLegacyOverrides({ flat_base: true, box_corner_attachments_only: false, extension_x_enabled: true, extension_y_enabled: false })).toEqual({
      flat_base: 'gridfinity', box_corner_attachments_only: 'disabled', extension_x_enabled: 'front',
    });
  });

  it('maps the wall pattern size, spacing and voronoi parameters', () => {
    expect(migrateLegacyOverrides({ wallpattern_enabled: true, wallpattern_hole_size: 7, wallpattern_hole_spacing: 3, wallpattern_voronoi_noise: 0.5 })).toEqual({
      wallpattern_enabled: true, wallpattern_cell_size: [7, 7], wallpattern_strength: 3, wallpattern_pattern_voronoi_noise: 0.5,
    });
  });

  it('maps wall cutouts onto the vertical and horizontal cutouts, mirroring left and right', () => {
    expect(migrateLegacyOverrides({ wallcutout_enabled: true, wallcutout_walls: [-2, 0, -2, 0], wallcutout_width: 20, wallcutout_height: 10 })).toEqual({
      wallcutout_vertical: 'frontonly', wallcutout_horizontal: 'rightonly',
      wallcutout_vertical_width: 20, wallcutout_horizontal_width: 20,
      wallcutout_vertical_height: 10, wallcutout_horizontal_height: 10,
    });
  });

  it('wraps a single chamber wall thickness into a pair', () => {
    expect(migrateLegacyOverrides({ chamber_wall_thickness: 1.6 })).toEqual({ chamber_wall_thickness: [1.6, 1.6] });
  });

  it('renames position and drops parameters the generator no longer has', () => {
    expect(migrateLegacyOverrides({ position: 'zero', zClearance: 1, cutx: 2, cuty: 3 })).toEqual({ render_position: 'zero' });
  });

  it('leaves current parameters alone', () => {
    const current = { lip_style: 'none', floor_thickness: 1.2, sub_pitch: 1, enable_magnets: true };
    expect(migrateLegacyOverrides(current)).toEqual(current);
  });
});

describe('008 custom spec generator params', () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ':memory:' });
    for (const m of [m001, m002, m003, m004, m005, m006, m007]) await m.up(client);
  });

  const spec = (overrides: Record<string, unknown>) => JSON.stringify({ width: 2.5, depth: 1.5, height: 3, overrides });

  it('rewrites the overrides of saved placed items and favorites', async () => {
    await client.execute({
      sql: `INSERT INTO layouts (id, name, grid_x, grid_y, width_mm, depth_mm, created_at, updated_at) VALUES (1, 'L', 6, 6, 252, 252, '', '')`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO placed_items (layout_id, library_id, item_id, x, y, width, height, rotation, sort_order, custom_spec)
            VALUES (1, 'custom', 'custom-abc', 0, 0, 5, 3, 0, 0, ?)`,
      args: [spec({ magnet_diameter: 6.5 })],
    });
    await client.execute({ sql: `INSERT INTO placed_items (layout_id, library_id, item_id, x, y, width, height, rotation, sort_order) VALUES (1, 'bins_standard', 'bin-3x2', 0, 4, 6, 4, 0, 1)`, args: [] });

    await m008.up(client);

    const rows = await client.execute(`SELECT custom_spec FROM placed_items ORDER BY sort_order`);
    expect(JSON.parse(String(rows.rows[0]['custom_spec']))).toEqual({
      width: 2.5, depth: 1.5, height: 3, overrides: { enable_magnets: true, magnet_size: [6.5, 2.4] },
    });
    expect(rows.rows[1]['custom_spec']).toBeNull();
  });

  it('is idempotent', async () => {
    await client.execute({
      sql: `INSERT INTO layouts (id, name, grid_x, grid_y, width_mm, depth_mm, created_at, updated_at) VALUES (1, 'L', 6, 6, 252, 252, '', '')`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO placed_items (layout_id, library_id, item_id, x, y, width, height, rotation, sort_order, custom_spec)
            VALUES (1, 'custom', 'custom-abc', 0, 0, 5, 3, 0, 0, ?)`,
      args: [spec({ half_pitch: false })],
    });
    await m008.up(client);
    await m008.up(client);
    const rows = await client.execute(`SELECT custom_spec FROM placed_items`);
    expect(JSON.parse(String(rows.rows[0]['custom_spec'])).overrides).toEqual({ sub_pitch: 1 });
  });
});
