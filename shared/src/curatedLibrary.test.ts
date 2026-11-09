import { describe, expect, it } from 'vitest';
import { matchCuratedEntry, validateCuratedLibrary } from './curatedLibrary.js';
import type { CuratedEntry, CuratedLibrary } from './curatedLibrary.js';

const entry: CuratedEntry = {
  id: 'cup', name: 'Cup', kind: 'parametric', generator: 'basic-cup',
  width: { min: 0.5, max: 20, step: 0.5 }, depth: { fixed: 2 },
  defaults: { height: 4 }, groups: [{ id: 'height', name: 'Height', choices: [
    { id: 'short', name: 'Short', values: { height: 2, lip_style: 'none' } },
    { id: 'tall', name: 'Tall', values: { height: 6, lip_style: 'normal' } },
  ] }],
};
const library = (e = entry): CuratedLibrary => ({ id: 'kitchen', name: 'Kitchen', description: '', entries: [e] });

describe('curated preset resolution', () => {
  it('resolves a bundle and maps rotated model axes', () => {
    const match = matchCuratedEntry(entry, 2, 3, { height: 'short' });
    expect(match).toMatchObject({ rotation: 90, spec: { width: 3, depth: 2, height: 2, overrides: { lip_style: 'none' } } });
    expect(matchCuratedEntry(entry, 3, 2, { height: 'tall' })).toMatchObject({ rotation: 0, spec: { height: 6 } });
  });
  it('matches fixed geometry in either orientation without scaling', () => {
    const fixed: CuratedEntry = { id: 'tray', name: 'Tray', kind: 'fixed', sourceId: 'bins:tray', width: 3, depth: 2 };
    expect(matchCuratedEntry(fixed, 2, 3)).toEqual({ rotation: 90 });
    expect(matchCuratedEntry(fixed, 2, 4)).toBeNull();
    expect(matchCuratedEntry({ ...fixed, width: 2, depth: 2 }, 2, 2)).toEqual({ rotation: 0 });
  });
  it('respects values, steps, half units, and unknown choices', () => {
    expect(matchCuratedEntry(entry, 2.5, 2)).not.toBeNull();
    expect(matchCuratedEntry(entry, 2.25, 2)).toBeNull();
    expect(matchCuratedEntry(entry, 3, 3)).toBeNull();
    expect(matchCuratedEntry(entry, 3, 2, { height: 'missing' })).toBeNull();
    expect(matchCuratedEntry({ ...entry, width: { values: [1, 3] } }, 2, 2)).toBeNull();
    expect(matchCuratedEntry({ ...entry, width: { min: 1, max: 5, step: 2 } }, 2, 2)).toBeNull();
  });
  it('finds a compatible preset instead of assuming the first choice', () => {
    const e: CuratedEntry = { ...entry, groups: [{ id: 'size', name: 'Size', choices: [
      { id: 'one', name: 'One', values: { width: 1 } }, { id: 'three', name: 'Three', values: { width: 3 } },
    ] }] };
    expect(matchCuratedEntry(e, 3, 2)).toMatchObject({ choices: { size: 'three' } });
    expect(matchCuratedEntry(e, 3, 2, { size: 'one' })).toBeNull();
  });
  it('validates source parameters, duplicate assignments and invalid dimensions', () => {
    expect(validateCuratedLibrary(library())).toEqual([]);
    expect(validateCuratedLibrary(library({ ...entry, defaults: { height: 4, invented: true } })).join(' ')).toContain('unknown parameter');
    expect(validateCuratedLibrary(library({ ...entry, width: { fixed: -1 } })).length).toBeGreaterThan(0);
    expect(validateCuratedLibrary(library({ ...entry, groups: [...entry.groups, { ...entry.groups[0], id: 'other' }] })).join(' ')).toContain('assigned by more than one');
    expect(validateCuratedLibrary(library({ ...entry, defaults: { height: 100 } })).length).toBeGreaterThan(0);
  });
  it('rejects unknown generators, invalid enum values, and contradictory fixed-axis presets', () => {
    expect(validateCuratedLibrary(library({ ...entry, generator: 'unknown' } as unknown as CuratedEntry)).length).toBeGreaterThan(0);
    expect(validateCuratedLibrary(library({ ...entry, defaults: { height: 4, lip_style: 'bogus' } })).length).toBeGreaterThan(0);
    expect(validateCuratedLibrary(library({ ...entry, groups: [{ id: 'depth', name: 'Depth', choices: [{ id: 'three', name: 'Three', values: { depth: 3 } }] }] })).length).toBeGreaterThan(0);
  });
});
