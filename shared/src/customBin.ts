import { GENERATOR_PARAM_SCHEMA, effectiveDefault } from './generatorParamSchema.js';
import type { ParamDef } from './generatorParamSchema.js';
import { gridfinityExtendedDefaultParams } from './types.js';

export interface CustomBinSpec {
  /** Grid units (42 mm), multiple of CUSTOM_BIN_STEP. */
  width: number;
  /** Grid units (42 mm), multiple of CUSTOM_BIN_STEP. */
  depth: number;
  /** Height units (7 mm), multiple of CUSTOM_BIN_STEP. */
  height: number;
  /** Only values that differ from the effective default. */
  overrides: Record<string, unknown>;
}

/** libraryId used by placed items / BOM lines that are custom bins. */
export const CUSTOM_LIBRARY_ID = 'custom';
export const CUSTOM_BIN_MIN = 0.5;
export const CUSTOM_BIN_MAX = 20;
export const CUSTOM_BIN_STEP = 0.5;

const OFF_VALUES = new Set(['none', 'disabled', 'off', 'false']);
const CHAMBER_ENABLE_THRESHOLD = 1;
const WALL_COUNT = 4;
/** Any number without its own max stays within this magnitude, so one request cannot ask for absurd geometry. */
const NUMBER_HARD_LIMIT = 1000;

const HALF_PITCH_PARAM = 'half_pitch';

const SCHEMA_BY_NAME = new Map<string, ParamDef>(GENERATOR_PARAM_SCHEMA.map(d => [d.name, d]));

function normalize(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/** Drops overrides equal to their effective default, so "explicit default" and "untouched" coincide. */
export function pruneOverrides(overrides: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(overrides).filter(([name, value]) => {
      const def = SCHEMA_BY_NAME.get(name);
      return !def || !sameValue(value, effectiveDefault(def));
    }),
  );
}

function enablerIsOn(enabler: ParamDef, value: unknown): boolean {
  if (enabler.kind === 'number') return typeof value === 'number' && value > CHAMBER_ENABLE_THRESHOLD;
  const v = normalize(value);
  if (typeof v === 'boolean') return v;
  return typeof v === 'string' && !OFF_VALUES.has(v);
}

/** Whether `def` applies given the current override values (defaults fill in the rest). */
export function isParamEnabled(def: ParamDef, values: Record<string, unknown>): boolean {
  if (!def.enabledBy) return true;
  const enabler = SCHEMA_BY_NAME.get(def.enabledBy);
  if (!enabler) return true;
  const value = Object.prototype.hasOwnProperty.call(values, enabler.name) ? values[enabler.name] : effectiveDefault(enabler);
  return enablerIsOn(enabler, value);
}

/** Whether a generator `half_pitch` value (boolean or "true"/"false") turns half-cell base pads on. */
export function halfPitchEnabled(value: unknown): boolean {
  return normalize(value) === true;
}

/** Half-unit placement needs the base pads subdivided, which is the generator's `half_pitch` option. */
export function specUsesHalfPitch(spec: Pick<CustomBinSpec, 'overrides'>): boolean {
  const def = SCHEMA_BY_NAME.get(HALF_PITCH_PARAM);
  const value = Object.prototype.hasOwnProperty.call(spec.overrides, HALF_PITCH_PARAM)
    ? spec.overrides[HALF_PITCH_PARAM]
    : def && effectiveDefault(def);
  return halfPitchEnabled(value);
}

export function buildCustomBinParams(spec: CustomBinSpec): Record<string, unknown> {
  return {
    ...gridfinityExtendedDefaultParams,
    width: [spec.width, 0],
    depth: [spec.depth, 0],
    height: [spec.height, 0],
    lip_style: 'normal',
    fingerslide: 'none',
    wallcutout_enabled: false,
    wallcutout_walls: [0, 0, 0, 0],
    ...pruneOverrides(spec.overrides),
  };
}

function validateSize(label: string, value: unknown, errors: string[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${label} must be a number`);
    return;
  }
  if (value < CUSTOM_BIN_MIN || value > CUSTOM_BIN_MAX) {
    errors.push(`${label} must be between ${CUSTOM_BIN_MIN} and ${CUSTOM_BIN_MAX}`);
    return;
  }
  if (!Number.isInteger(value / CUSTOM_BIN_STEP)) errors.push(`${label} must be a multiple of ${CUSTOM_BIN_STEP}`);
}

function stringMatches(def: ParamDef, value: string): boolean {
  if (def.maxLength !== undefined && value.length > def.maxLength) return false;
  return def.pattern === undefined || new RegExp(def.pattern).test(value);
}

function validateOverrideValue(def: ParamDef, value: unknown): string | null {
  switch (def.kind) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${def.name} must be a number`;
      if (def.integer && !Number.isInteger(value)) return `${def.name} must be a whole number`;
      if (def.min !== undefined && value < def.min) return `${def.name} must be at least ${def.min}`;
      if (Math.abs(value) > (def.max ?? NUMBER_HARD_LIMIT)) return `${def.name} must be at most ${def.max ?? NUMBER_HARD_LIMIT}`;
      return null;
    case 'bool':
      return typeof value === 'boolean' ? null : `${def.name} must be true or false`;
    case 'string':
      return typeof value === 'string' && stringMatches(def, value) ? null : `${def.name} has an invalid format`;
    case 'enum':
      return typeof value === 'string' && def.options?.includes(value) ? null : `${def.name} must be one of ${def.options?.join(', ')}`;
    case 'array': {
      const length = def.arrayLength ?? WALL_COUNT;
      const min = def.elementMin ?? -NUMBER_HARD_LIMIT;
      const max = def.elementMax ?? NUMBER_HARD_LIMIT;
      const ok = Array.isArray(value) && value.length === length
        && value.every(n => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max);
      return ok ? null : `${def.name} must be ${length} numbers`;
    }
  }
}

export type CustomBinValidation = { ok: true; spec: CustomBinSpec } | { ok: false; errors: string[] };

export function validateCustomBinSpec(input: unknown): CustomBinValidation {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) return { ok: false, errors: ['spec must be an object'] };
  const raw = input as Record<string, unknown>;

  validateSize('width', raw['width'], errors);
  validateSize('depth', raw['depth'], errors);
  validateSize('height', raw['height'], errors);

  const overrides = raw['overrides'];
  if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
    errors.push('overrides must be an object');
    return { ok: false, errors };
  }
  const values = overrides as Record<string, unknown>;

  for (const [name, value] of Object.entries(values)) {
    const def = SCHEMA_BY_NAME.get(name);
    if (!def) {
      errors.push(`unknown parameter ${name}`);
      continue;
    }
    const problem = validateOverrideValue(def, value);
    if (problem) {
      errors.push(problem);
      continue;
    }
    if (!sameValue(value, effectiveDefault(def)) && !isParamEnabled(def, values)) {
      errors.push(`${name} requires ${def.enabledBy} to be on`);
    }
  }

  const hasHalfFootprint = [raw['width'], raw['depth']].some(v => typeof v === 'number' && !Number.isInteger(v));
  if (hasHalfFootprint && !specUsesHalfPitch({ overrides: values })) {
    errors.push('half-unit width or depth requires half_pitch to be on');
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, spec: raw as unknown as CustomBinSpec };
}
