import type { LibraryManifest, LibraryIndex, LibraryItem, LibraryMeta } from '../../types/gridfinity';
import { mergeGeneratorParams } from '../../utils/generatorParams';
import type { DataSourceAdapter, LibraryInfo } from './types';

const MANIFEST_PATH = '/libraries/manifest.json';

export class StaticAdapter implements DataSourceAdapter {
  private manifestCache: LibraryManifest | null = null;
  private metaCache = new Map<string, LibraryMeta>();

  async getLibraries(): Promise<LibraryInfo[]> {
    const manifest = await this.fetchManifest();

    const libraries = await Promise.all(
      manifest.libraries.map(async (lib) => {
        try {
          const response = await fetch(lib.path);
          const data: LibraryIndex = await response.json();
          return {
            id: lib.id,
            name: lib.name,
            path: lib.path,
            itemCount: data.items?.length ?? 0,
          };
        } catch {
          return { id: lib.id, name: lib.name, path: lib.path, itemCount: undefined };
        }
      })
    );

    return libraries;
  }

  async getLibraryItems(libraryId: string): Promise<LibraryItem[]> {
    const manifest = await this.fetchManifest();
    const lib = manifest.libraries.find((l) => l.id === libraryId);
    if (!lib) return [];

    const response = await fetch(lib.path);
    if (!response.ok) throw new Error(`Failed to fetch library ${libraryId}`);
    const data: LibraryIndex = await response.json();
    const libraryDefaults = data.defaultParameters ?? {};

    return (data.items ?? []).map((item) => ({
      ...item,
      defaultParameters: mergeGeneratorParams(libraryDefaults, item.defaultParameters),
    }));
  }

  async getLibraryMeta(libraryId: string): Promise<LibraryMeta> {
    if (this.metaCache.has(libraryId)) return this.metaCache.get(libraryId)!;
    const manifest = await this.fetchManifest();
    const lib = manifest.libraries.find((l) => l.id === libraryId);
    if (!lib) return { customizableFields: [], defaultParameters: {} };
    try {
      const response = await fetch(lib.path);
      if (!response.ok) return { customizableFields: [], defaultParameters: {} };
      const data: LibraryIndex = await response.json();
      const meta: LibraryMeta = {
        customizableFields: data.customizableFields ?? [],
        defaultParameters: data.defaultParameters ?? {},
      };
      this.metaCache.set(libraryId, meta);
      return meta;
    } catch {
      return { customizableFields: [], defaultParameters: {} };
    }
  }

  resolveImageUrl(libraryId: string, imagePath: string): string {
    if (imagePath.startsWith('/libraries/') || imagePath.startsWith('http')) {
      return imagePath;
    }
    return `/libraries/${libraryId}/${imagePath}`;
  }

  private async fetchManifest(): Promise<LibraryManifest> {
    if (this.manifestCache) return this.manifestCache;
    const response = await fetch(MANIFEST_PATH);
    if (!response.ok) throw new Error('Failed to fetch library manifest');
    this.manifestCache = await response.json();
    return this.manifestCache!;
  }

  clearCache(): void {
    this.manifestCache = null;
    this.metaCache.clear();
  }
}
