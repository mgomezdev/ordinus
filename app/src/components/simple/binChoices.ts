import type { CuratedEntry, CustomBinSpec, ParametricCuratedEntry } from '@gridfinity/shared';
import type { BinCustomization, FavoriteItem, LibraryItem } from '../../types/gridfinity';

export type BinChoice = CuratedEntry & { customization?: BinCustomization; favorite?: boolean };

export function parameterizedChoice(id: string, name: string, spec?: CustomBinSpec): ParametricCuratedEntry {
  return {
    id, name, kind: 'parametric', generator: 'basic-cup',
    width: { min: 0.5, max: 20, step: 0.5 }, depth: { min: 0.5, max: 20, step: 0.5 },
    defaults: { height: spec?.height ?? 4, ...spec?.overrides }, groups: [],
  };
}

/** Custom favorites are reusable parameter presets; fixed favorites retain their customization. */
export function favoriteChoices(favorites: FavoriteItem[]): BinChoice[] {
  return favorites.map(f => ({
    ...(f.customSpec ? parameterizedChoice(`favorite:${f.id}`, f.name, f.customSpec) : {
      id: `favorite:${f.id}`, name: f.name, kind: 'fixed' as const,
      sourceId: `${f.libraryId}:${f.libraryItemId}`, width: f.widthUnits, depth: f.heightUnits,
      customization: f.customization,
    }), favorite: true,
  }));
}

export function existingChoices(items: LibraryItem[]): BinChoice[] {
  return items.filter(item => item.isActive !== false).map(item => ({
    id: `existing:${item.id}`, name: item.name, kind: 'fixed', sourceId: item.id,
    width: item.widthUnits, depth: item.heightUnits,
  }));
}
