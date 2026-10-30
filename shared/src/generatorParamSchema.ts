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
  /** Inclusive bounds for each array element. */
  elementMin?: number;
  elementMax?: number;
  /** Numbers must be whole. */
  integer?: boolean;
  /** Strings must match this regular expression (full match) and be at most maxLength long. */
  pattern?: string;
  maxLength?: number;
  /** Name of the parameter that must be on (true, or not "none"/"disabled") for this one to apply. */
  enabledBy?: string;
  help?: string;
}

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
/** Numbers (mm) separated by |, e.g. 10.5|21|42. Anything else would reach the OpenSCAD -D expression. */
const SEPARATOR_PATTERN = String.raw`^[0-9]+(\.[0-9]+)?(\|[0-9]+(\.[0-9]+)?)*$`;
const SEPARATOR_MAX_LENGTH = 200;
const FLAG = { elementMin: 0, elementMax: 1 };
const RATIO_LIMIT = 100;

const WALL_PATTERN_STYLES = [
  'hexgrid', 'grid', 'slats', 'voronoi', 'voronoigrid', 'voronoihexgrid', 'brick', 'brickoffset',
  'kumiko_tobi_asanoha', 'kumiko_asanoha', 'kumiko_goma', 'kumiko_tsumiishi_kikko', 'kumiko_bishamon_kikkou', 'kumiko_mikado',
];
const FILL_MODES = ['none', 'space', 'crop', 'crophorizontal', 'cropvertical', 'crophorizontal_spacevertical', 'cropvertical_spacehorizontal', 'spacevertical', 'spacehorizontal'];
const CUTOUT_POSITION_HELP = '-0.5 disables the wall; positive is grid units; negative is a ratio of the wall length (-2 is the middle).';
const CUTOUT_POSITION = [-2, -0.5, -0.5, -0.5];

/** Every user-facing parameter of generator/generate_bin.py, minus width/depth/height and debug flags. */
export const GENERATOR_PARAM_SCHEMA: ParamDef[] = [
  // General
  pick('filled_in', 'General', 'Filled in', 'disabled', ['disabled', 'enabled', 'enabledfilllip'], { help: 'Solid block; overrides the options below.' }),
  num('wall_thickness', 'General', 'Wall thickness (mm)', 0, { min: 0, step: 0.01, help: '0 picks a thickness from the bin height.' }),
  pick('lip_style', 'General', 'Lip style', 'normal', ['normal', 'reduced', 'reduced_double', 'minimum', 'none']),
  bool('lip_top_notches', 'General', 'Lip notches', true, { help: 'Notch in the lip to prevent sliding.' }),
  pick('render_position', 'General', 'Position', 'center', ['default', 'center', 'zero']),

  // Subdivisions
  list('chamber_wall_thickness', 'Subdivisions', 'Chamber wall thickness (mm)', [1.2, 1.2], { elementMin: 0, elementMax: 100 }),
  num('vertical_chambers', 'Subdivisions', 'Vertical chambers (X)', 1, { min: 1, max: 20, step: 1, integer: true }),
  num('vertical_separator_bend_position', 'Subdivisions', 'Vertical separator bend position', 0, { step: 0.1, enabledBy: 'vertical_chambers' }),
  num('vertical_separator_bend_angle', 'Subdivisions', 'Vertical separator bend angle', 45, { step: 1, enabledBy: 'vertical_chambers' }),
  num('vertical_separator_bend_separation', 'Subdivisions', 'Vertical separator bend separation', 0, { step: 0.1, enabledBy: 'vertical_chambers' }),
  num('vertical_separator_cut_depth', 'Subdivisions', 'Vertical separator cut depth', 0, { min: 0, step: 0.1, enabledBy: 'vertical_chambers' }),
  num('horizontal_chambers', 'Subdivisions', 'Horizontal chambers (Y)', 1, { min: 1, max: 20, step: 1, integer: true }),
  num('horizontal_separator_bend_position', 'Subdivisions', 'Horizontal separator bend position', 0, { step: 0.1, enabledBy: 'horizontal_chambers' }),
  num('horizontal_separator_bend_angle', 'Subdivisions', 'Horizontal separator bend angle', 45, { step: 1, enabledBy: 'horizontal_chambers' }),
  num('horizontal_separator_bend_separation', 'Subdivisions', 'Horizontal separator bend separation', 0, { step: 0.1, enabledBy: 'horizontal_chambers' }),
  num('horizontal_separator_cut_depth', 'Subdivisions', 'Horizontal separator cut depth', 0, { min: 0, step: 0.1, enabledBy: 'horizontal_chambers' }),
  bool('vertical_irregular_subdivisions', 'Subdivisions', 'Vertical irregular subdivisions', false),
  text('vertical_separator_config', 'Subdivisions', 'Vertical separator positions', '10.5|21|42|50|60', {
    enabledBy: 'vertical_irregular_subdivisions',
    pattern: SEPARATOR_PATTERN,
    maxLength: SEPARATOR_MAX_LENGTH,
    help: 'Positions in mm from the left end, separated by |.',
  }),
  bool('horizontal_irregular_subdivisions', 'Subdivisions', 'Horizontal irregular subdivisions', false),
  text('horizontal_separator_config', 'Subdivisions', 'Horizontal separator positions', '10.5|21|42|50|60', {
    enabledBy: 'horizontal_irregular_subdivisions',
    pattern: SEPARATOR_PATTERN,
    maxLength: SEPARATOR_MAX_LENGTH,
    help: 'Positions in mm from the front, separated by |.',
  }),

  // Base
  bool('enable_magnets', 'Base', 'Magnets', false),
  list('magnet_size', 'Base', 'Magnet size (diameter, height mm)', [6.5, 2.4], { enabledBy: 'enable_magnets', elementMin: 0, elementMax: 100, help: 'The original design uses 6.5 x 2.4.' }),
  pick('magnet_easy_release', 'Base', 'Magnet easy release', 'auto', ['off', 'auto', 'inner', 'outer'], { enabledBy: 'enable_magnets' }),
  bool('enable_screws', 'Base', 'Screws', false),
  list('screw_size', 'Base', 'Screw size (diameter, depth mm)', [3, 6], { enabledBy: 'enable_screws', elementMin: 0, elementMax: 100, help: 'The original design uses 3 x 6.' }),
  list('center_magnet_size', 'Base', 'Center magnet size (diameter, height mm)', [0, 0], { elementMin: 0, elementMax: 100 }),
  num('hole_overhang_remedy', 'Base', 'Hole overhang remedy', 2, { min: 0, max: 10, step: 1, integer: true }),
  pick('box_corner_attachments_only', 'Base', 'Corner attachments only', 'enabled', ['disabled', 'enabled', 'aligned']),
  num('floor_thickness', 'Base', 'Floor thickness (mm)', 0.7, { min: 0, step: 0.1 }),
  num('cavity_floor_radius', 'Base', 'Cavity floor radius (mm)', -1, { step: 0.1 }),
  pick('efficient_floor', 'Base', 'Efficient floor', 'off', ['off', 'on', 'rounded', 'smooth']),
  num('sub_pitch', 'Base', 'Sub pitch', 1, { min: 1, max: 4, step: 1, integer: true, help: '1 off, 2 half pitch (allows half-cell offsets), 3 third, 4 quarter.' }),
  pick('flat_base', 'Base', 'Flat base', 'off', ['off', 'gridfinity', 'rounded']),
  bool('spacer', 'Base', 'Spacer (no floor)', false),

  // Label
  pick('label_style', 'Label', 'Label style', 'disabled', ['disabled', 'normal', 'gflabel', 'pred', 'cullenect', 'cullenect_legacy']),
  pick('label_position', 'Label', 'Label position', 'left', ['left', 'right', 'center', 'leftchamber', 'rightchamber', 'centerchamber'], { enabledBy: 'label_style' }),
  list('label_size', 'Label', 'Label size (width, depth, height, radius)', [0, 14, 0, 0.6], { enabledBy: 'label_style', elementMin: 0, elementMax: 1000 }),
  list('label_relief', 'Label', 'Label relief (width, depth, height, radius)', [0, 0, 0, 0.6], { enabledBy: 'label_style', elementMin: 0, elementMax: 1000 }),
  list('label_walls', 'Label', 'Label walls', [0, 1, 0, 0], { enabledBy: 'label_style', help: WALLS_HELP, ...FLAG }),

  // Sliding lid
  bool('sliding_lid_enabled', 'Sliding Lid', 'Sliding lid', false),
  num('sliding_lid_thickness', 'Sliding Lid', 'Lid thickness (mm)', 0, { min: 0, step: 0.1, enabledBy: 'sliding_lid_enabled' }),
  num('sliding_lid_min_wall_thickness', 'Sliding Lid', 'Minimum wall thickness (mm)', 0, { min: 0, step: 0.1, enabledBy: 'sliding_lid_enabled' }),
  num('sliding_lid_min_support', 'Sliding Lid', 'Minimum support (mm)', 0, { min: 0, step: 0.1, enabledBy: 'sliding_lid_enabled' }),
  num('sliding_lid_clearance', 'Sliding Lid', 'Clearance (mm)', 0.1, { min: 0, step: 0.1, enabledBy: 'sliding_lid_enabled' }),

  // Finger slide
  pick('fingerslide', 'Finger Slide', 'Finger slide', 'none', ['none', 'rounded', 'chamfered']),
  num('fingerslide_radius', 'Finger Slide', 'Radius (mm)', -3, { step: 0.5, enabledBy: 'fingerslide', help: 'Negative divides the dimension: -3 is a third.' }),
  list('fingerslide_walls', 'Finger Slide', 'Walls', [1, 0, 0, 0], { enabledBy: 'fingerslide', help: WALLS_HELP, ...FLAG }),

  // Tapered corner
  pick('tapered_corner', 'Tapered Corner', 'Tapered corner', 'none', ['none', 'rounded', 'chamfered']),
  num('tapered_corner_size', 'Tapered Corner', 'Size (mm)', 10, { min: 0, step: 0.5, enabledBy: 'tapered_corner' }),
  num('tapered_setback', 'Tapered Corner', 'Setback (mm)', -1, { step: 0.1, enabledBy: 'tapered_corner', help: '-1 uses the gridfinity corner radius.' }),

  // Wall pattern
  bool('wallpattern_enabled', 'Wall Pattern', 'Wall pattern', false),
  pick('wallpattern_style', 'Wall Pattern', 'Style', 'hexgrid', WALL_PATTERN_STYLES, { enabledBy: 'wallpattern_enabled' }),
  num('wallpattern_strength', 'Wall Pattern', 'Strength between holes (mm)', 2, { min: 0.5, max: 50, step: 0.1, enabledBy: 'wallpattern_enabled' }),
  list('wallpattern_walls', 'Wall Pattern', 'Walls', [1, 1, 1, 1], { enabledBy: 'wallpattern_enabled', help: WALLS_HELP, ...FLAG }),
  list('wallpattern_cell_size', 'Wall Pattern', 'Cell size (mm)', [10, 10], { enabledBy: 'wallpattern_enabled', elementMin: 1, elementMax: 100 }),
  pick('wallpattern_dividers_enabled', 'Wall Pattern', 'Pattern on dividers', 'disabled', ['disabled', 'horizontal', 'vertical', 'both'], { enabledBy: 'wallpattern_enabled' }),
  num('wallpattern_hole_sides', 'Wall Pattern', 'Hole sides', 6, { min: 3, max: 64, step: 1, integer: true, enabledBy: 'wallpattern_enabled', help: '4 square, 6 hex, 8 octagon, 64 circle.' }),
  num('wallpattern_hole_radius', 'Wall Pattern', 'Hole corner radius (mm)', 0.5, { min: 0, step: 0.05, enabledBy: 'wallpattern_enabled' }),
  pick('wallpattern_fill', 'Wall Pattern', 'Fill mode', 'none', FILL_MODES, { enabledBy: 'wallpattern_enabled' }),
  num('wallpattern_pattern_voronoi_noise', 'Wall Pattern', 'Voronoi noise', 0.75, { min: 0, step: 0.05, enabledBy: 'wallpattern_enabled' }),

  // Wall cutout (vertical: front and back walls, horizontal: left and right walls)
  pick('wallcutout_vertical', 'Wall Cutout', 'Front/back cutout', 'disabled', ['disabled', 'enabled', 'inneronly', 'wallsonly', 'frontonly', 'backonly']),
  list('wallcutout_vertical_position', 'Wall Cutout', 'Front/back position', CUTOUT_POSITION, {
    enabledBy: 'wallcutout_vertical',
    elementMin: -RATIO_LIMIT,
    elementMax: RATIO_LIMIT,
    help: CUTOUT_POSITION_HELP,
  }),
  num('wallcutout_vertical_width', 'Wall Cutout', 'Front/back width', 0, { min: 0, step: 0.1, enabledBy: 'wallcutout_vertical' }),
  num('wallcutout_vertical_angle', 'Wall Cutout', 'Front/back angle', 70, { min: 0, max: 90, step: 1, enabledBy: 'wallcutout_vertical' }),
  num('wallcutout_vertical_height', 'Wall Cutout', 'Front/back height', 0, { step: 0.1, enabledBy: 'wallcutout_vertical' }),
  num('wallcutout_vertical_corner_radius', 'Wall Cutout', 'Front/back corner radius (mm)', 5, { min: 0, step: 0.5, enabledBy: 'wallcutout_vertical' }),
  pick('wallcutout_horizontal', 'Wall Cutout', 'Left/right cutout', 'disabled', ['disabled', 'enabled', 'inneronly', 'wallsonly', 'leftonly', 'rightonly']),
  list('wallcutout_horizontal_position', 'Wall Cutout', 'Left/right position', CUTOUT_POSITION, {
    enabledBy: 'wallcutout_horizontal',
    elementMin: -RATIO_LIMIT,
    elementMax: RATIO_LIMIT,
    help: CUTOUT_POSITION_HELP,
  }),
  num('wallcutout_horizontal_width', 'Wall Cutout', 'Left/right width', 0, { min: 0, step: 0.1, enabledBy: 'wallcutout_horizontal' }),
  num('wallcutout_horizontal_angle', 'Wall Cutout', 'Left/right angle', 70, { min: 0, max: 90, step: 1, enabledBy: 'wallcutout_horizontal' }),
  num('wallcutout_horizontal_height', 'Wall Cutout', 'Left/right height', 0, { step: 0.1, enabledBy: 'wallcutout_horizontal' }),
  num('wallcutout_horizontal_corner_radius', 'Wall Cutout', 'Left/right corner radius (mm)', 5, { min: 0, step: 0.5, enabledBy: 'wallcutout_horizontal' }),

  // Extendable
  pick('extension_x_enabled', 'Extendable', 'Extend in X', 'disabled', ['disabled', 'front', 'back']),
  pick('extension_y_enabled', 'Extendable', 'Extend in Y', 'disabled', ['disabled', 'front', 'back']),
  bool('extension_tabs_enabled', 'Extendable', 'Extension tabs', true),
];

/** What Ordinus generates when the parameter is left alone: the shared Ordinus defaults, else the generator default. */
export function effectiveDefault(def: ParamDef): unknown {
  return Object.prototype.hasOwnProperty.call(gridfinityExtendedDefaultParams, def.name)
    ? gridfinityExtendedDefaultParams[def.name]
    : def.default;
}
