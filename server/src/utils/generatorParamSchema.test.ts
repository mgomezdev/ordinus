import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { GENERATOR_PARAM_SCHEMA, effectiveDefault } from '@gridfinity/shared';

const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';
const GENERATOR_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../generator');

interface RegistryEntry { default: unknown; type: string }

function loadRegistry(): Record<string, RegistryEntry> {
  const out = execFileSync(
    PYTHON_CMD,
    ['-c', 'import json,sys; sys.path.insert(0, sys.argv[1]); import generate_bin as g; print(json.dumps(g.PARAM_REGISTRY))', GENERATOR_DIR],
    { encoding: 'utf8' },
  );
  return JSON.parse(out) as Record<string, RegistryEntry>;
}

const SIZE_AND_DEBUG = new Set(['width', 'depth', 'height', 'cutx', 'cuty', 'enable_help']);
const KIND_FOR_TYPE: Record<string, string[]> = {
  array: ['array'],
  string: ['string', 'enum'],
  bool: ['bool'],
  number: ['number'],
};

describe('GENERATOR_PARAM_SCHEMA', () => {
  const registry = loadRegistry();

  it('has unique names', () => {
    const names = GENERATOR_PARAM_SCHEMA.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('only names parameters that exist in PARAM_REGISTRY, with matching defaults and kinds', () => {
    for (const def of GENERATOR_PARAM_SCHEMA) {
      const reg = registry[def.name];
      expect(reg, `${def.name} missing from PARAM_REGISTRY`).toBeDefined();
      expect(def.default, `${def.name} default`).toEqual(reg.default);
      expect(KIND_FOR_TYPE[reg.type], `${def.name} kind`).toContain(def.kind);
    }
  });

  it('covers every PARAM_REGISTRY entry except size and debug params', () => {
    const schemaNames = new Set(GENERATOR_PARAM_SCHEMA.map(p => p.name));
    const missing = Object.keys(registry).filter(n => !SIZE_AND_DEBUG.has(n) && !schemaNames.has(n));
    expect(missing).toEqual([]);
    for (const n of SIZE_AND_DEBUG) expect(schemaNames.has(n)).toBe(false);
  });

  it('references only existing parameters in enabledBy', () => {
    const names = new Set(GENERATOR_PARAM_SCHEMA.map(p => p.name));
    for (const def of GENERATOR_PARAM_SCHEMA) {
      if (def.enabledBy) expect(names.has(def.enabledBy), `${def.name} enabledBy`).toBe(true);
    }
  });

  it('gives enum params non-empty options that include the default', () => {
    for (const def of GENERATOR_PARAM_SCHEMA.filter(p => p.kind === 'enum')) {
      expect(def.options?.length, def.name).toBeGreaterThan(0);
      expect(def.options, def.name).toContain(def.default);
    }
  });

  it('effectiveDefault prefers the Ordinus defaults over the schema default', () => {
    const byName = (n: string) => GENERATOR_PARAM_SCHEMA.find(p => p.name === n)!;
    expect(effectiveDefault(byName('label_style'))).toBe('disabled');
    expect(effectiveDefault(byName('half_pitch'))).toBe('true');
    expect(effectiveDefault(byName('lip_style'))).toBe('normal');
  });
});
