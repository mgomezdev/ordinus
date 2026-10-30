// Emits the generator params Ordinus builds for each regression case (library bins via the BOM builder, custom bins via buildCustomBinParams).
// Run from server/ (the BOM builder opens the server database): npx tsx ../generator/regression/emit_params.ts out.json
import fs from 'fs';
import { buildCustomBinParams } from '@gridfinity/shared';
import { buildGenerateParams } from '../../server/src/services/bomGeneration.service.ts';

const ROOT = new URL('../../', import.meta.url);
const OUT = process.argv[2] ?? 'regression-params.json';
const lib = (id: string) => JSON.parse(fs.readFileSync(new URL(`app/public/libraries/${id}/index.json`, ROOT), 'utf8').replace(/^\uFEFF/, ''));
const cust = { wallPatternEnabled: false, wallPattern: 'grid', lipStyle: 'normal', fingerSlide: 'none', wallCutout: { front: false, back: false, left: false, right: false }, height: 4 };
const cfg = (w: number, d: number, c: object = {}, parameters?: object) => ({ widthUnits: w, heightUnits: d, customization: { ...cust, ...c }, qty: 1, filename: 'b.stl', baseModelPath: 'x', parameters });
const spec = (width: number, depth: number, height: number, overrides: object = {}) => ({ width, depth, height, overrides });
const cases: Record<string, Record<string, unknown>> = {
  lib_standard_3x2: buildGenerateParams(cfg(3, 2, {}, lib('bins_standard').parameters)),
  lib_labeled_2x1: buildGenerateParams(cfg(2, 1, {}, lib('bins_labeled').parameters)),
  lib_shadowbox_2x2: buildGenerateParams(cfg(2, 2, {}, lib('bins_shadowbox').parameters)),
  lib_lip_reduced: buildGenerateParams(cfg(2, 1, { lipStyle: 'reduced' }, lib('bins_standard').parameters)),
  lib_lip_none: buildGenerateParams(cfg(2, 1, { lipStyle: 'none' }, lib('bins_standard').parameters)),
  lib_lip_minimum: buildGenerateParams(cfg(2, 1, { lipStyle: 'minimum' }, lib('bins_standard').parameters)),
  lib_fingerslide_rounded: buildGenerateParams(cfg(2, 1, { fingerSlide: 'rounded' }, lib('bins_standard').parameters)),
  lib_fingerslide_chamfer: buildGenerateParams(cfg(2, 1, { fingerSlide: 'chamfered' }, lib('bins_standard').parameters)),
  lib_cutout_front: buildGenerateParams(cfg(2, 1, { wallCutout: { front: true, back: false, left: false, right: false } }, lib('bins_standard').parameters)),
  lib_cutout_left: buildGenerateParams(cfg(2, 1, { wallCutout: { front: false, back: false, left: true, right: false } }, lib('bins_standard').parameters)),
  lib_cutout_all: buildGenerateParams(cfg(2, 2, { wallCutout: { front: true, back: true, left: true, right: true } }, lib('bins_standard').parameters)),
  lib_wallpattern_grid: buildGenerateParams(cfg(2, 1, { wallPatternEnabled: true, wallPattern: 'grid' }, lib('bins_standard').parameters)),
  lib_wallpattern_hex: buildGenerateParams(cfg(2, 1, { wallPatternEnabled: true, wallPattern: 'hexgrid' }, lib('bins_standard').parameters)),
  custom_default: buildCustomBinParams(spec(3, 2, 4)),
  custom_half: buildCustomBinParams(spec(2.5, 1.5, 3.5)),
  custom_whole_no_halfpitch: buildCustomBinParams(spec(3, 2, 4, { sub_pitch: 1 })),
  custom_magnets_screws: buildCustomBinParams(spec(2, 1, 3, { enable_magnets: true, enable_screws: true })),
  custom_magnet_size: buildCustomBinParams(spec(2, 1, 3, { enable_magnets: true, magnet_size: [8, 3] })),
  custom_center_magnet: buildCustomBinParams(spec(2, 1, 3, { center_magnet_size: [10, 2] })),
  custom_label: buildCustomBinParams(spec(2, 1, 3, { label_style: 'normal' })),
  custom_label_back: buildCustomBinParams(spec(2, 1, 3, { label_style: 'normal', label_walls: [1, 0, 0, 0] })),
  custom_dividers: buildCustomBinParams(spec(3, 2, 3, { vertical_chambers: 3, horizontal_chambers: 2 })),
  custom_sliding_lid: buildCustomBinParams(spec(2, 1, 3, { sliding_lid_enabled: true, sliding_lid_thickness: 3, sliding_lid_min_wall_thickness: 2 })),
  custom_efficient_floor: buildCustomBinParams(spec(2, 1, 3, { efficient_floor: 'on' })),
  custom_tapered: buildCustomBinParams(spec(2, 1, 3, { tapered_corner: 'rounded' })),
  custom_extension: buildCustomBinParams(spec(2, 1, 3, { extension_x_enabled: 'front' })),
  custom_filled: buildCustomBinParams(spec(2, 1, 3, { filled_in: 'enabled' })),
  custom_floor: buildCustomBinParams(spec(2, 1, 3, { floor_thickness: 1.5, wall_thickness: 1.6 })),
  custom_flat_base: buildCustomBinParams(spec(2, 1, 3, { flat_base: 'gridfinity' })),
  custom_spacer: buildCustomBinParams(spec(2, 1, 3, { spacer: true })),
};
fs.writeFileSync(OUT, JSON.stringify(cases, null, 1));
console.log(Object.keys(cases).length, 'cases ->', OUT);
