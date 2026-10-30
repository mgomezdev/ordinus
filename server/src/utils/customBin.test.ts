import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  GENERATOR_PARAM_SCHEMA,
  buildCustomBinParams,
  effectiveDefault,
  isParamEnabled,
  pruneOverrides,
  validateCustomBinSpec,
} from '@gridfinity/shared';
import type { BinCustomization, CustomBinSpec } from '@gridfinity/shared';
import { buildGenerateParams } from '../services/bomGeneration.service.js';
import { computeParamHash } from './generationParams.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const LIBRARIES_DIR = path.join(REPO_ROOT, 'app/public/libraries');
const GOLDEN_FILE = path.join(HERE, 'libraryHashes.golden.json');
const BOM_PATTERN = new RegExp('^' + String.fromCharCode(0xfeff));
const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

const DEFAULT_CUSTOMIZATION: BinCustomization = {
  wallPatternEnabled: false,
  wallPattern: 'grid',
  lipStyle: 'normal',
  fingerSlide: 'none',
  wallCutout: { front: false, back: false, left: false, right: false },
  height: 4,
};

interface LibraryIndexFile {
  baseModel?: string;
  parameters?: Record<string, unknown>;
  items: { id: string; widthUnits: number; heightUnits: number; stlFile?: string }[];
}

function readLibraryIndex(libraryId: string): LibraryIndexFile {
  const raw = fs.readFileSync(path.join(LIBRARIES_DIR, libraryId, 'index.json'), 'utf8').replace(BOM_PATTERN, '');
  return JSON.parse(raw) as LibraryIndexFile;
}

function libraryParams(index: LibraryIndexFile, item: LibraryIndexFile['items'][number]): Record<string, unknown> {
  return buildGenerateParams({
    widthUnits: item.widthUnits,
    heightUnits: item.heightUnits,
    customization: DEFAULT_CUSTOMIZATION,
    qty: 1,
    filename: 'bin.stl',
    baseModelPath: 'unused',
    parameters: index.parameters && Object.keys(index.parameters).length > 0 ? index.parameters : undefined,
  });
}

const spec = (over: Partial<CustomBinSpec> = {}): CustomBinSpec => ({ width: 3, depth: 2, height: 4, overrides: {}, ...over });

describe('buildCustomBinParams - equivalence with the library', () => {
  it('3x2x4 with no overrides equals the bins_standard 3x2 item (same params, same hash)', () => {
    const index = readLibraryIndex('bins_standard');
    const item = index.items.find(i => i.id === 'bin-3x2')!;
    const libParams = libraryParams(index, item);
    const custom = buildCustomBinParams(spec());
    expect(custom).toEqual(libParams);
    expect(computeParamHash(custom)).toBe(computeParamHash(libParams));
  });

  it('keeps every existing library item hash unchanged (golden)', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(LIBRARIES_DIR, 'manifest.json'), 'utf8').replace(BOM_PATTERN, '')) as {
      libraries: { id: string }[];
    };
    const actual: Record<string, string> = {};
    for (const lib of manifest.libraries) {
      const index = readLibraryIndex(lib.id);
      if (!index.baseModel) continue;
      for (const item of index.items.filter(i => !i.stlFile)) {
        actual[`${lib.id}/${item.id}`] = computeParamHash(libraryParams(index, item));
      }
    }
    if (process.env['UPDATE_GOLDEN'] === '1') fs.writeFileSync(GOLDEN_FILE, JSON.stringify(actual, null, 2) + '\n');
    expect(Object.keys(actual).length).toBeGreaterThan(0);
    expect(actual).toEqual(JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')));
  });
});

describe('buildCustomBinParams - explicit default equals assumed default', () => {
  const baseline = buildCustomBinParams(spec());

  it.each(GENERATOR_PARAM_SCHEMA.map(d => [d.name, d] as const))('%s set to its default changes nothing', (_name, def) => {
    const explicit = buildCustomBinParams(spec({ overrides: { [def.name]: effectiveDefault(def) } }));
    expect(explicit).toEqual(baseline);
    expect(computeParamHash(explicit)).toBe(computeParamHash(baseline));
  });

  it('every parameter set to its default at once changes nothing', () => {
    const all = Object.fromEntries(GENERATOR_PARAM_SCHEMA.map(d => [d.name, effectiveDefault(d)]));
    expect(pruneOverrides(all)).toEqual({});
    expect(computeParamHash(buildCustomBinParams(spec({ overrides: all })))).toBe(computeParamHash(baseline));
  });

  it('treats boolean true and the string "true" as the same default', () => {
    const half = GENERATOR_PARAM_SCHEMA.find(d => d.name === 'half_pitch')!;
    expect(effectiveDefault(half)).toBe('true');
    expect(pruneOverrides({ half_pitch: true })).toEqual({});
  });

  it('produces the identical generate_bin.py command for omitted and explicit defaults', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-bin-'));
    const script = path.join(REPO_ROOT, 'generator/generate_bin.py');
    const commandFor = (params: Record<string, unknown>): string => {
      const file = path.join(dir, 'params.json');
      fs.writeFileSync(file, JSON.stringify(params));
      const out = execFileSync(PYTHON_CMD, [script, file, '--output', 'out.stl', '--model', 'model.scad', '--dry-run'], { encoding: 'utf8' });
      const lines = out.split(/\r?\n/);
      return lines[lines.indexOf('Command:') + 1];
    };
    try {
      const explicitDefaults = Object.fromEntries(GENERATOR_PARAM_SCHEMA.map(d => [d.name, effectiveDefault(d)]));
      const omitted = commandFor(buildCustomBinParams(spec()));
      const explicit = commandFor({ ...buildCustomBinParams(spec()), ...explicitDefaults });
      expect(omitted).toContain('-D width=[3,0]');
      expect(explicit).toBe(omitted);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildCustomBinParams - overrides and sizes', () => {
  it('applies a non-default override and changes the hash', () => {
    const custom = buildCustomBinParams(spec({ overrides: { magnet_diameter: 6.5 } }));
    expect(custom['magnet_diameter']).toBe(6.5);
    expect(computeParamHash(custom)).not.toBe(computeParamHash(buildCustomBinParams(spec())));
  });

  it('overrides lip_style and fingerslide in place of the forced values', () => {
    const custom = buildCustomBinParams(spec({ overrides: { lip_style: 'none', fingerslide: 'rounded' } }));
    expect(custom['lip_style']).toBe('none');
    expect(custom['fingerslide']).toBe('rounded');
  });

  it('writes half-unit sizes as unit arrays', () => {
    const custom = buildCustomBinParams({ width: 2.5, depth: 1.5, height: 3.5, overrides: {} });
    expect(custom['width']).toEqual([2.5, 0]);
    expect(custom['depth']).toEqual([1.5, 0]);
    expect(custom['height']).toEqual([3.5, 0]);
  });
});

describe('validateCustomBinSpec', () => {
  const bad = (s: unknown) => {
    const r = validateCustomBinSpec(s);
    expect(r.ok).toBe(false);
  };

  it('accepts half-unit sizes and valid overrides', () => {
    const r = validateCustomBinSpec({ width: 0.5, depth: 20, height: 3.5, overrides: { magnet_diameter: 6.5, label_walls: [1, 0, 0, 0] } });
    expect(r.ok).toBe(true);
  });

  it.each([0, -1, 2.3, 20.5, 21, NaN, Infinity])('rejects size %s', (v) => {
    bad(spec({ width: v }));
    bad(spec({ depth: v }));
    bad(spec({ height: v }));
  });

  it('rejects non-objects and missing overrides', () => {
    bad(null);
    bad('x');
    bad({ width: 1, depth: 1, height: 1 });
  });

  it('rejects unknown, debug and size keys in overrides', () => {
    bad(spec({ overrides: { not_a_param: 1 } }));
    bad(spec({ overrides: { cutx: 5 } }));
    bad(spec({ overrides: { width: [9, 0] } }));
  });

  it('rejects wrongly typed values', () => {
    bad(spec({ overrides: { magnet_diameter: 'big' } }));
    bad(spec({ overrides: { lip_style: 'sideways' } }));
    bad(spec({ overrides: { label_walls: [1, 0, 0] } }));
    bad(spec({ overrides: { wallpattern_enabled: 'yes' } }));
    bad(spec({ overrides: { magnet_diameter: Number.NaN } }));
  });

  it('rejects a dependent parameter whose enabler is off, accepts it when on', () => {
    bad(spec({ overrides: { wallpattern_hole_size: 3 } }));
    expect(validateCustomBinSpec(spec({ overrides: { wallpattern_enabled: true, wallpattern_hole_size: 3 } })).ok).toBe(true);
    bad(spec({ overrides: { label_position: 'right' } }));
    expect(validateCustomBinSpec(spec({ overrides: { label_style: 'normal', label_position: 'right' } })).ok).toBe(true);
  });
});

describe('isParamEnabled', () => {
  const def = (n: string) => GENERATOR_PARAM_SCHEMA.find(d => d.name === n)!;
  it('follows the enabler value', () => {
    expect(isParamEnabled(def('wallpattern_style'), {})).toBe(false);
    expect(isParamEnabled(def('wallpattern_style'), { wallpattern_enabled: true })).toBe(true);
    expect(isParamEnabled(def('fingerslide_radius'), { fingerslide: 'rounded' })).toBe(true);
    expect(isParamEnabled(def('vertical_separator_bend_angle'), { vertical_chambers: 2 })).toBe(true);
    expect(isParamEnabled(def('vertical_separator_bend_angle'), {})).toBe(false);
    expect(isParamEnabled(def('lip_style'), {})).toBe(true);
  });
});

describe('validateCustomBinSpec - injection and resource limits', () => {
  const enabled = { vertical_irregular_subdivisions: true };
  const check = (overrides: Record<string, unknown>) => validateCustomBinSpec(spec({ overrides })).ok;

  it('accepts well-formed separator configs and rejects anything that could escape the -D string', () => {
    expect(check({ ...enabled, vertical_separator_config: '10.5|21|42' })).toBe(true);
    for (const evil of ['1"; import("/etc/passwd"); "', '1|2" , x', '10|\\', '1 | 2', '', 'a|b', '1|'.repeat(200)]) {
      expect(check({ ...enabled, vertical_separator_config: evil }), evil).toBe(false);
    }
  });

  it('caps counts and magnitudes', () => {
    expect(check({ vertical_chambers: 21 })).toBe(false);
    expect(check({ vertical_chambers: 2.5 })).toBe(false);
    expect(check({ wallpattern_enabled: true, wallpattern_hole_sides: 65 })).toBe(false);
    expect(check({ wallpattern_enabled: true, wallpattern_hole_size: 0.01 })).toBe(false);
    expect(check({ magnet_diameter: 1e9 })).toBe(false);
    expect(check({ label_walls: [1, 5, 0, 0], label_style: 'normal' })).toBe(false);
  });

  it('escapes quotes and backslashes in generate_bin.py string values', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-bin-esc-'));
    try {
      const file = path.join(dir, 'p.json');
      fs.writeFileSync(file, JSON.stringify({ vertical_separator_config: String.raw`a"b\c` }));
      const out = execFileSync(PYTHON_CMD, [path.join(REPO_ROOT, 'generator/generate_bin.py'), file, '--dry-run'], { encoding: 'utf8' });
      expect(out).toContain(String.raw`vertical_separator_config="a\"b\\c"`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
