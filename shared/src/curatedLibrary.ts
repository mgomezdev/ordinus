import { pruneOverrides, validateCustomBinSpec } from './customBin.js';
import type { CustomBinSpec } from './customBin.js';

/** Dimensions here are user-facing grid units, not the stored half-cell coordinates. */
export type CuratedAxis = { fixed: number } | { values: number[] } | { min: number; max: number; step: number };
export interface PresetChoice { id: string; name: string; values: Record<string, unknown> }
export interface PresetGroup { id: string; name: string; choices: PresetChoice[] }
interface EntryBase { id: string; name: string }
export interface FixedCuratedEntry extends EntryBase {
  kind: 'fixed'; sourceId: string; width: number; depth: number;
}
export interface ParametricCuratedEntry extends EntryBase {
  kind: 'parametric'; generator: 'basic-cup'; width: CuratedAxis; depth: CuratedAxis;
  /** Flat generator inputs, with numeric width/depth/height in grid/height units. */
  defaults: Record<string, unknown>; groups: PresetGroup[];
}
export type CuratedEntry = FixedCuratedEntry | ParametricCuratedEntry;
export interface CuratedLibrary { id: string; name: string; description: string; entries: CuratedEntry[] }
export interface CuratedMatch { rotation: 0 | 90; spec?: CustomBinSpec; choices?: Record<string, string> }

const validSize = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0.5 && n <= 20 && Number.isInteger(n * 2);
const named = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 200;
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (v: object, key: string) => Object.prototype.hasOwnProperty.call(v, key);

export function axisAllows(axis: CuratedAxis, value: number): boolean {
  if (!validSize(value)) return false;
  if ('fixed' in axis) return axis.fixed === value;
  if ('values' in axis) return axis.values.includes(value);
  return value >= axis.min && value <= axis.max && Number.isInteger((value * 2 - axis.min * 2) / (axis.step * 2));
}

function axisSample(axis: CuratedAxis): number {
  return 'fixed' in axis ? axis.fixed : 'values' in axis ? axis.values[0] : axis.min;
}

function validAxis(axis: unknown): axis is CuratedAxis {
  if (!object(axis)) return false;
  if (own(axis, 'fixed')) return Object.keys(axis).length === 1 && validSize(axis.fixed);
  if (own(axis, 'values')) return Object.keys(axis).length === 1 && Array.isArray(axis.values) && axis.values.length > 0 && axis.values.length <= 40 && axis.values.every(validSize);
  return Object.keys(axis).length === 3 && validSize(axis.min) && validSize(axis.max) && validSize(axis.step) && axis.min <= axis.max;
}

function makeSpec(values: Record<string, unknown>, width: number, depth: number): CustomBinSpec {
  const { width: _width, depth: _depth, height = 4, ...overrides } = values;
  return { width, depth, height: height as number, overrides: pruneOverrides(overrides) };
}

/** Bounded combinations also let the picker find any valid preset rather than assuming defaults fit. */
function combinations(entry: ParametricCuratedEntry, selected: Record<string, string> = {}): { values: Record<string, unknown>; choices: Record<string, string> }[] {
  if (Object.keys(selected).some(id => !entry.groups.some(group => group.id === id))) return [];
  let result = [{ values: entry.defaults, choices: {} as Record<string, string> }];
  for (const group of entry.groups) {
    result = result.flatMap(base => group.choices
      .filter(choice => !own(selected, group.id) || selected[group.id] === choice.id)
      .map(choice => ({ values: { ...base.values, ...choice.values }, choices: { ...base.choices, [group.id]: choice.id } })));
    if (result.length > 256) return [];
  }
  return result;
}

export function matchCuratedEntry(entry: CuratedEntry, width: number, depth: number, selected: Record<string, string> = {}, accepts: (match: CuratedMatch) => boolean = () => true): CuratedMatch | null {
  return assessCuratedEntry(entry, width, depth, selected, accepts).match;
}

function describeAxis(axis: CuratedAxis): string {
  if ('fixed' in axis) return String(axis.fixed);
  if ('values' in axis) return axis.values.join(', ');
  return `${axis.min}–${axis.max} in steps of ${axis.step}`;
}

/** Explain the same constraints used for placement, including both possible orientations. */
export function assessCuratedEntry(entry: CuratedEntry, width: number, depth: number, selected: Record<string, string> = {}, accepts: (match: CuratedMatch) => boolean = () => true,
  rejectionReason = 'This bin cannot be placed at this position.'): { match: CuratedMatch | null; reasons: string[] } {
  const unsupported = (reasons: string[]) => ({ match: null, reasons });
  if (!validSize(width) || !validSize(depth)) return unsupported(['Width and depth must be 0.5–20 grid units in half-grid steps.']);
  const reasons = new Set<string>();
  let axesFit = false;
  for (const rotation of [0, 90] as const) {
    const w = rotation === 0 ? width : depth;
    const d = rotation === 0 ? depth : width;
    if (entry.kind === 'fixed') {
      if (entry.width === w && entry.depth === d) {
        axesFit = true;
        if (accepts({ rotation })) return { match: { rotation }, reasons: [] };
        reasons.add(rejectionReason);
      }
      continue;
    }
    if (entry.generator !== 'basic-cup' || !axisAllows(entry.width, w) || !axisAllows(entry.depth, d)) continue;
    axesFit = true;
    for (const combination of combinations(entry, selected)) {
      const { values, choices } = combination;
      if ((own(values, 'width') && values.width !== w) || (own(values, 'depth') && values.depth !== d)) continue;
      const spec = makeSpec(values, w, d);
      const match = { rotation, spec, choices };
      const validation = validateCustomBinSpec(spec);
      if (!validation.ok) {
        validation.errors.forEach(error => reasons.add(error.startsWith('half-unit')
          ? 'Half-grid steps are not supported by these options. Choose a half-grid preset or use whole-unit dimensions and positions.'
          : error));
      } else if (accepts(match)) return { match, reasons: [] };
      else reasons.add(rejectionReason);
    }
  }
  if (!axesFit) return unsupported([entry.kind === 'fixed'
    ? `Width × depth not supported: this bin requires ${entry.width} × ${entry.depth} grid units (rotation allowed).`
    : `Width × depth not supported: width: ${describeAxis(entry.width)}; depth: ${describeAxis(entry.depth)} grid units (rotation allowed).`]);
  return unsupported(reasons.size ? [...reasons] : [`These presets do not support the ${width} × ${depth} footprint. Choose different options or draw a different size.`]);
}

/** Runtime validation is shared by the authoring UI and API; never trust saved JSON as a type assertion. */
export function validateCuratedLibrary(input: unknown): string[] {
  const errors: string[] = [];
  if (!object(input) || !named(input.id) || !/^[a-zA-Z0-9_-]+$/.test(input.id) || !named(input.name)
    || typeof input.description !== 'string' || input.description.length > 1000 || !Array.isArray(input.entries) || input.entries.length > 200) return ['Invalid library name, id, description, or entries (maximum 200)'];
  const ids = new Set<string>();
  for (const raw of input.entries) {
    if (!object(raw) || !named(raw.id) || !named(raw.name) || ids.has(raw.id)) { errors.push('Entries require unique ids and names'); continue; }
    ids.add(raw.id);
    if (raw.kind === 'fixed') {
      if (!named(raw.sourceId) || !raw.sourceId.includes(':') || !validSize(raw.width) || !validSize(raw.depth)) errors.push(`${raw.name}: invalid fixed source or dimensions`);
      continue;
    }
    if (raw.kind !== 'parametric' || raw.generator !== 'basic-cup' || !validAxis(raw.width) || !validAxis(raw.depth)
      || !object(raw.defaults) || !Array.isArray(raw.groups) || raw.groups.length > 8) { errors.push(`${raw.name}: invalid generator, dimensions, defaults, or groups`); continue; }
    const groupIds = new Set<string>();
    const assigned = new Set<string>();
    let count = 1;
    let groupsValid = true;
    for (const group of raw.groups) {
      if (!object(group) || !named(group.id) || !named(group.name) || groupIds.has(group.id) || !Array.isArray(group.choices) || group.choices.length < 1 || group.choices.length > 32) {
        errors.push(`${raw.name}: groups require unique ids and 1–32 named choices`); groupsValid = false; continue;
      }
      groupIds.add(group.id);
      count *= group.choices.length;
      const choiceIds = new Set<string>();
      const keys = new Set<string>();
      for (const choice of group.choices) {
        if (!object(choice) || !named(choice.id) || !named(choice.name) || choiceIds.has(choice.id) || !object(choice.values) || Object.keys(choice.values).length === 0) {
          errors.push(`${raw.name}: choices require unique ids, names, and values`); groupsValid = false; continue;
        }
        choiceIds.add(choice.id);
        Object.keys(choice.values).forEach(key => keys.add(key));
      }
      for (const key of keys) {
        if (assigned.has(key)) errors.push(`${raw.name}: ${key} assigned by more than one option group`);
        assigned.add(key);
      }
    }
    if (count > 256) { errors.push(`${raw.name}: maximum 256 preset combinations`); continue; }
    if (!groupsValid) continue;
    const entry = raw as unknown as ParametricCuratedEntry;
    // Validate defaults separately so a preset cannot conceal an invalid default.
    for (const values of [entry.defaults, ...combinations(entry).map(c => c.values)]) {
      const w = own(values, 'width') ? values.width : axisSample(entry.width);
      const d = own(values, 'depth') ? values.depth : axisSample(entry.depth);
      if (!validSize(w) || !validSize(d) || !axisAllows(entry.width, w) || !axisAllows(entry.depth, d)) { errors.push(`${entry.name}: preset dimensions conflict with allowed axes`); continue; }
      const result = validateCustomBinSpec(makeSpec(values, w, d));
      if (!result.ok) errors.push(...result.errors.map(error => `${entry.name}: ${error}`));
    }
  }
  return [...new Set(errors)];
}
