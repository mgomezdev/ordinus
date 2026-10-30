import { gridfinityExtendedDefaultParams } from './types.js';

export type ParamGroup =
  | 'General'
  | 'Subdivisions'
  | 'Base'
  | 'Label'
  | 'Sliding Lid'
  | 'Finger Slide'
  | 'Tapered Corner'
  | 'Wall Pattern'
  | 'Wall Cutout'
  | 'Extendable';

export type ParamKind = 'number' | 'string' | 'enum' | 'bool' | 'array';

export interface ParamDef {
  name: string;
  group: ParamGroup;
  label: string;
  kind: ParamKind;
  default: unknown;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  arrayLength?: number;
  /** Name of the parameter that must be on (true, or not "none"/"disabled") for this one to apply. */
  enabledBy?: string;
  help?: string;
}

const WALL_ARRAY = 4;

function num(name: string, group: ParamGroup, label: string, def: number, extra: Partial<ParamDef> = {}): ParamDef {
  return { name, group, label, kind: 'number', default: def, ...extra };
}

function bool(name: string, group: ParamGroup, label: string, def: boolean, extra: Partial<ParamDef> = {}): ParamDef {
  return { name, group, label, kind: 'bool', default: def, ...extra };
}

function pick(name: string, group: ParamGroup, label: string, def: string, options: string[], extra: Partial<ParamDef> = {}): ParamDef {
  return { name, group, label, kind: 'enum', default: def, options, ...extra };
}

function text(name: string, group: ParamGroup, label: string, def: string, extra: Partial<ParamDef> = {}): ParamDef {
  return { name, group, label, kind: 'string', default: def, ...extra };
}

function list(name: string, group: ParamGroup, label: string, def: number[], extra: Partial<ParamDef> = {}): ParamDef {
  return { name, group, label, kind: 'array', default: def, arrayLength: def.length, ...extra };
}

const WALLS_HELP = 'Front, back, left, right.';

/** Every user-facing parameter of generator/generate_bin.py, minus width/depth/height and debug flags. */
export const GENERATOR_PARAM_SCHEMA: ParamDef[] = [
  // General
  pick('filled_in', 'General', 'Filled in', 'disabled', ['disabled', 'enabled'], { help: 'Solid block; overrides the options below.' }),
  num('wall_thickness', 'General', 'Wall thickness (mm)', 0, { min: 0, step: 0.01, help: '0 picks a thickness from the bin height.' }),
  pick('lip_style', 'General', 'Lip style', 'normal', ['normal', 'reduced', 'minimum', 'none']),
  pick('position', 'General', 'Position', 'center', ['default', 'center', 'zero']),
  num('zClearance', 'General', 'Z clearance (mm)', 0, { min: 0, step: 0.1, help: 'Undersizes the bin top for easier stacking.' }),

  // Subdivisions
  num('chamber_wall_thickness', 'Subdivisions', 'Chamber wall thickness (mm)', 1.2, { min: 0, step: 0.1 }),
  num('vertical_chambers', 'Subdivisions', 'Vertical chambers (X)', 1, { min: 1, step: 1 }),
  num('vertical_separator_bend_position', 'Subdivisions', 'Vertical separator bend position', 0, { step: 0.1, enabledBy: 'vertical_chambers' }),
  num('vertical_separator_bend_angle', 'Subdivisions', 'Vertical separator bend angle', 0, { step: 1, enabledBy: 'vertical_chambers' }),
  num('vertical_separator_bend_separation', 'Subdivisions', 'Vertical separator bend separation', 0, { step: 0.1, enabledBy: 'vertical_chambers' }),
  num('vertical_separator_cut_depth', 'Subdivisions', 'Vertical separator cut depth', 0, { min: 0, step: 0.1, enabledBy: 'vertical_chambers' }),
  num('horizontal_chambers', 'Subdivisions', 'Horizontal chambers (Y)', 1, { min: 1, step: 1 }),
  num('horizontal_separator_bend_position', 'Subdivisions', 'Horizontal separator bend position', 0, { step: 0.1, enabledBy: 'horizontal_chambers' }),
  num('horizontal_separator_bend_angle', 'Subdivisions', 'Horizontal separator bend angle', 0, { step: 1, enabledBy: 'horizontal_chambers' }),
  num('horizontal_separator_bend_separation', 'Subdivisions', 'Horizontal separator bend separation', 0, { step: 0.1, enabledBy: 'horizontal_chambers' }),
  num('horizontal_separator_cut_depth', 'Subdivisions', 'Horizontal separator cut depth', 0, { min: 0, step: 0.1, enabledBy: 'horizontal_chambers' }),
  bool('vertical_irregular_subdivisions', 'Subdivisions', 'Vertical irregular subdivisions', false),
  text('vertical_separator_config', 'Subdivisions', 'Vertical separator positions', '10.5|21|42|50|60', {
    enabledBy: 'vertical_irregular_subdivisions',
    help: 'Positions in mm from the left end, separated by |.',
  }),
  bool('horizontal_irregular_subdivisions', 'Subdivisions', 'Horizontal irregular subdivisions', false),
  text('horizontal_separator_config', 'Subdivisions', 'Horizontal separator positions', '10.5|21|42|50|60', {
    enabledBy: 'horizontal_irregular_subdivisions',
    help: 'Positions in mm from the front, separated by |.',
  }),

  // Base
  num('magnet_diameter', 'Base', 'Magnet diameter (mm)', 0, { min: 0, step: 0.1, help: "Zack's design uses 6.5." }),
  pick('magnet_easy_release', 'Base', 'Magnet easy release', 'auto', ['off', 'auto', 'inner', 'outer']),
  num('screw_depth', 'Base', 'Screw depth (mm)', 0, { min: 0, step: 0.1, help: "Zack's design uses 6." }),
  num('center_magnet_diameter', 'Base', 'Center magnet diameter (mm)', 0, { min: 0, step: 0.1 }),
  num('center_magnet_thickness', 'Base', 'Center magnet thickness (mm)', 0, { min: 0, step: 0.1 }),
  num('hole_overhang_remedy', 'Base', 'Hole overhang remedy', 2, { min: 0, step: 1 }),
  bool('box_corner_attachments_only', 'Base', 'Corner attachments only', true),
  num('floor_thickness', 'Base', 'Floor thickness (mm)', 0.7, { min: 0, step: 0.1 }),
  num('cavity_floor_radius', 'Base', 'Cavity floor radius (mm)', -1, { step: 0.1 }),
  pick('efficient_floor', 'Base', 'Efficient floor', 'off', ['off', 'on', 'rounded', 'smooth']),
  bool('half_pitch', 'Base', 'Half pitch', false, { help: 'Subdivide base pads to allow half-cell offsets.' }),
  bool('flat_base', 'Base', 'Flat base', false),
  bool('spacer', 'Base', 'Spacer (no floor)', false),

  // Label
  pick('label_style', 'Label', 'Label style', 'normal', ['disabled', 'normal', 'click']),
  pick('label_position', 'Label', 'Label position', 'left', ['left', 'right', 'center', 'leftchamber', 'rightchamber', 'centerchamber'], { enabledBy: 'label_style' }),
  list('label_size', 'Label', 'Label size (width, depth, height, radius)', [0, 14, 0, 0.6], { enabledBy: 'label_style' }),
  num('label_relief', 'Label', 'Label relief (mm)', 0, { min: 0, step: 0.1, enabledBy: 'label_style' }),
  list('label_walls', 'Label', 'Label walls', [1, 0, 0, 0], { enabledBy: 'label_style', help: WALLS_HELP }),

  // Sliding lid
  bool('sliding_lid_enabled', 'Sliding Lid', 'Sliding lid', false),
  num('sliding_lid_thickness', 'Sliding Lid', 'Lid thickness (mm)', 0, { min: 0, step: 0.1, enabledBy: 'sliding_lid_enabled' }),
  num('sliding_min_wallThickness', 'Sliding Lid', 'Minimum wall thickness (mm)', 0, { min: 0, step: 0.1, enabledBy: 'sliding_lid_enabled' }),
  num('sliding_min_support', 'Sliding Lid', 'Minimum support (mm)', 0, { min: 0, step: 0.1, enabledBy: 'sliding_lid_enabled' }),
  num('sliding_clearance', 'Sliding Lid', 'Clearance (mm)', 0.1, { min: 0, step: 0.1, enabledBy: 'sliding_lid_enabled' }),

  // Finger slide
  pick('fingerslide', 'Finger Slide', 'Finger slide', 'none', ['none', 'rounded', 'chamfered']),
  num('fingerslide_radius', 'Finger Slide', 'Radius (mm)', 8, { min: 0, step: 0.5, enabledBy: 'fingerslide' }),
  list('fingerslide_walls', 'Finger Slide', 'Walls', [1, 0, 0, 0], { enabledBy: 'fingerslide', help: WALLS_HELP }),

  // Tapered corner
  pick('tapered_corner', 'Tapered Corner', 'Tapered corner', 'none', ['none', 'rounded', 'chamfered']),
  num('tapered_corner_size', 'Tapered Corner', 'Size (mm)', 10, { min: 0, step: 0.5, enabledBy: 'tapered_corner' }),
  num('tapered_setback', 'Tapered Corner', 'Setback (mm)', -1, { step: 0.1, enabledBy: 'tapered_corner', help: '-1 uses the gridfinity corner radius.' }),

  // Wall pattern
  bool('wallpattern_enabled', 'Wall Pattern', 'Wall pattern', false),
  pick('wallpattern_style', 'Wall Pattern', 'Style', 'grid', ['grid', 'gridrotated', 'hexgrid', 'hexgridrotated', 'voronoi', 'voronoigrid', 'voronoihexgrid'], { enabledBy: 'wallpattern_enabled' }),
  num('wallpattern_hole_spacing', 'Wall Pattern', 'Hole spacing (mm)', 2, { min: 0, step: 0.1, enabledBy: 'wallpattern_enabled' }),
  list('wallpattern_walls', 'Wall Pattern', 'Walls', [1, 1, 1, 1], { enabledBy: 'wallpattern_enabled', help: WALLS_HELP }),
  pick('wallpattern_dividers_enabled', 'Wall Pattern', 'Pattern on dividers', 'disabled', ['disabled', 'horizontal', 'vertical', 'both'], { enabledBy: 'wallpattern_enabled' }),
  num('wallpattern_hole_sides', 'Wall Pattern', 'Hole sides', 6, { min: 3, step: 1, enabledBy: 'wallpattern_enabled', help: '4 square, 6 hex, 64 circle.' }),
  num('wallpattern_hole_size', 'Wall Pattern', 'Hole size (mm)', 5, { min: 0, step: 0.1, enabledBy: 'wallpattern_enabled' }),
  pick('wallpattern_fill', 'Wall Pattern', 'Fill mode', 'crop', ['none', 'space', 'crop', 'crophorizontal', 'cropvertical', 'crophorizontal_spacevertical', 'cropvertical_spacehorizontal', 'spacevertical', 'spacehorizontal'], { enabledBy: 'wallpattern_enabled' }),
  num('wallpattern_voronoi_noise', 'Wall Pattern', 'Voronoi noise', 0.75, { min: 0, step: 0.05, enabledBy: 'wallpattern_enabled' }),
  num('wallpattern_voronoi_radius', 'Wall Pattern', 'Voronoi radius', 0.5, { min: 0, step: 0.05, enabledBy: 'wallpattern_enabled' }),

  // Wall cutout
  bool('wallcutout_enabled', 'Wall Cutout', 'Wall cutout', false),
  list('wallcutout_walls', 'Wall Cutout', 'Walls', [0, 0, 0, 0], {
    enabledBy: 'wallcutout_enabled',
    help: `${WALLS_HELP} 0 off; positive grid units; negative is a ratio of the wall length (-2 is half).`,
  }),
  num('wallcutout_width', 'Wall Cutout', 'Width', 0, { min: 0, step: 0.1, enabledBy: 'wallcutout_enabled' }),
  num('wallcutout_angle', 'Wall Cutout', 'Angle', 70, { min: 0, max: 90, step: 1, enabledBy: 'wallcutout_enabled' }),
  num('wallcutout_height', 'Wall Cutout', 'Height', 0, { min: 0, step: 0.1, enabledBy: 'wallcutout_enabled' }),
  num('wallcutout_corner_radius', 'Wall Cutout', 'Corner radius (mm)', 5, { min: 0, step: 0.5, enabledBy: 'wallcutout_enabled' }),

  // Extendable
  bool('extension_x_enabled', 'Extendable', 'Extend in X', false),
  bool('extension_y_enabled', 'Extendable', 'Extend in Y', false),
  bool('extension_tabs_enabled', 'Extendable', 'Extension tabs', true),
];

/** What Ordinus generates when the parameter is left alone: the shared Ordinus defaults, else the generator default. */
export function effectiveDefault(def: ParamDef): unknown {
  return Object.prototype.hasOwnProperty.call(gridfinityExtendedDefaultParams, def.name)
    ? gridfinityExtendedDefaultParams[def.name]
    : def.default;
}
