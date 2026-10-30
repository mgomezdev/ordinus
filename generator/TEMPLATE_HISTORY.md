# Generator template history

`gridfinity_basic_cup.scad` is upstream [gridfinity_extended_openscad](https://github.com/ostat/gridfinity_extended_openscad)'s
`combined/gridfinity_basic_cup.scad`. The same file is copied into `app/public/libraries/bins_labeled`,
`bins_shadowbox` and `bins_standard`. Update all four together.

If generated bins behave unexpectedly, check this file first: the template changed in the commit below and several
parameters were renamed or re-defaulted.

## 2026-10-30: upstream combined build `44A0A025` (commit `f40a67f`)

| | |
|---|---|
| New template | upstream `94d5a3e`, `combined/gridfinity_basic_cup.scad`, header "Generated 2026-09-23 11:24", content hash `44A0A025E7A02DAA585378DF78A1740B259EF6EA70ABF1EF966561FF55A226F8` |
| Previous template | header "Generated 2024-08-05 22:19", git blob `720e143b`; restore with `git show f40a67f~1:generator/gridfinity_basic_cup.scad` |

### Parameter changes (old -> new)

| Old | New |
|---|---|
| `half_pitch` (bool) | `sub_pitch` (1 off, 2 half pitch, 3 third, 4 quarter); Ordinus default is 2 |
| `magnet_diameter` | `enable_magnets` + `magnet_size` `[diameter, height]` (old height was fixed 2.4) |
| `screw_depth` | `enable_screws` + `screw_size` `[diameter, depth]` (old diameter was fixed 3) |
| `center_magnet_diameter`, `center_magnet_thickness` | `center_magnet_size` `[diameter, height]` |
| `wallcutout_enabled`, `wallcutout_walls`, `_width`, `_angle`, `_height`, `_corner_radius` | `wallcutout_vertical` (front/back) and `wallcutout_horizontal` (left/right) with their own `_position`, `_width`, `_angle`, `_height`, `_corner_radius`; **left and right are mirrored** (see `shared/src/wallCutout.ts`) |
| `wallpattern_hole_spacing` | `wallpattern_strength` |
| `wallpattern_hole_size` | `wallpattern_cell_size` `[x, y]` |
| `wallpattern_voronoi_noise`, `_voronoi_radius` | `wallpattern_pattern_voronoi_noise`, `wallpattern_hole_radius` |
| `sliding_min_wallThickness`, `sliding_min_support`, `sliding_clearance` | `sliding_lid_min_wall_thickness`, `sliding_lid_min_support`, `sliding_lid_clearance` |
| `position` | `render_position` |
| `extension_x_enabled`, `extension_y_enabled` (bool) | `"disabled"` / `"front"` / `"back"` |
| `flat_base` (bool) | `"off"` / `"gridfinity"` / `"rounded"` |
| `box_corner_attachments_only` (bool) | `"disabled"` / `"enabled"` / `"aligned"` |
| `chamber_wall_thickness` (number) | `[x, y]` array |
| `label_relief` (number) | `[width, depth, height, radius]` array |
| `label_walls` | same shape, **front and back swapped** (old `[1,0,0,0]` is new `[0,1,0,0]`) |
| `label_style` `click` | `cullenect`, `cullenect_legacy` (plus `gflabel`, `pred`) |
| `zClearance`, `cutx`, `cuty` | removed (`zClearance` had no effect; `cut` is the debug cut) |
| (new) | `lip_top_notches`, `headroom`, floor patterns, text, `lip_style` `reduced_double`, ... |

### Defaults the template changed, and what Ordinus does about it

`generate_bin.py` only passes a parameter to OpenSCAD when it differs from `PARAM_REGISTRY`'s default, and the registry
now mirrors the template. Ordinus pins the previous behaviour in `shared/src/gridfinity-extended-default-params.json`:

| Parameter | Template default | Ordinus value (previous template default) |
|---|---|---|
| `fingerslide_radius` | -3 | 8 |
| `wallpattern_style` | `hexgrid` | `grid` |
| `wallpattern_fill` | `none` | `crop` |
| `wallpattern_cell_size` | `[10,10]` | `[5,5]` (old hole size 5) |
| `vertical_separator_bend_angle`, `horizontal_separator_bend_angle` | 45 | 0 |
| `lip_top_notches` (new) | true | false |
| `sub_pitch` | 1 | 2 (replaces `half_pitch` "true") |

`label_style` was overridden to `disabled` before; that now equals the template default, so the override was removed.
Library bins that used `label_walls` `[0,1,0,0]` (`bins_labeled`) now use `[1,0,0,0]` to keep the label on the same wall.

### Data migration

DB migration `008_custom_spec_generator_params` rewrites the overrides stored in saved custom bins (`placed_items.custom_spec`,
`favorites.custom_spec`) to the new names. It is forward-only. Custom favorites keep their old `custom-<hash>` ids, which no
longer match freshly built ones; generation still works because it rebuilds from the stored spec.
Library golden hashes (`server/src/utils/libraryHashes.golden.json`) were regenerated because the emitted params changed,
so previously generated library STLs regenerate on demand.

### Geometry regression (old vs new template)

Run with `generator/regression/compare_geometry.py` (30 library and custom cases through the real caller code).
Within 0.7% volume and 0.012 mm mean surface distance: library bins, lips, finger slides, wall cutouts, half and whole pitch,
magnets and screws, center magnet, floors, filled, tapered corners, efficient floor.

Known differences caused by the new template, not by the callers:

| Feature | Difference |
|---|---|
| Label | about +2.7% volume, up to 1 mm |
| Wall pattern | about -3.3% volume, up to 2.4 mm (different algorithm; old and new could not be matched by parameters) |
| `flat_base` `gridfinity` | about +13% volume, base roughly 0.7 mm thicker |
| `spacer` | about -12% volume, up to 15 mm; cause not investigated |
| Sliding lid | up to 1.8 mm detail difference |
| Dividers | -0.4% volume, 0.8 mm detail |
| Extension tabs | up to 1 mm, X extent -0.4 mm |
