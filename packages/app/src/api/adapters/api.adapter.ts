import type { LibraryItem, LibraryMeta } from '../../types/gridfinity';
import { mergeGeneratorParams } from '../../utils/generatorParams';
import type { DataSourceAdapter, LibraryInfo } from './types';

export class ApiAdapter implements DataSourceAdapter {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getLibraries(): Promise<LibraryInfo[]> {
    const response = await fetch(`${this.baseUrl}/libraries`);
    if (!response.ok) throw new Error('Failed to fetch libraries');
    const json = await response.json();
    return json.data.map((lib: Record<string, unknown>) => ({
      id: lib.id as string,
      name: lib.name as string,
      path: '',
      description: lib.description as string | undefined,
      itemCount: lib.itemCount as number | undefined,
    }));
  }

  async getLibraryItems(libraryId: string): Promise<LibraryItem[]> {
    const response = await fetch(`${this.baseUrl}/libraries/${libraryId}/items`);
    if (!response.ok) throw new Error(`Failed to fetch items for ${libraryId}`);
    const json = await response.json();

    const meta = await this.getLibraryMeta(libraryId);
    const libraryDefaults = meta.gridfinityExtendedParams;

    return json.data.map((item: Record<string, unknown>) => ({
      id: item.id as string,
      libraryId: item.libraryId as string,
      name: item.name as string,
      widthUnits: item.widthUnits as number,
      heightUnits: item.heightUnits as number,
      color: item.color as string,
      categories: item.categories as string[],
      stlFile: (item.stlFile as string | null | undefined) ?? undefined,
      imageUrl: item.imagePath as string | undefined,
      perspectiveImageUrl: item.perspectiveImagePath as string | undefined,
      gridfinityExtendedParams: mergeGeneratorParams(
        libraryDefaults,
        (item.gridfinityExtendedParams as Record<string, unknown> | undefined)
      ),
    }));
  }

  async getLibraryMeta(libraryId: string): Promise<LibraryMeta> {
    try {
      const manifestResponse = await fetch('/libraries/manifest.json');
      if (!manifestResponse.ok) return { customizableFields: [], gridfinityExtendedParams: {} };
      const manifest = await manifestResponse.json();
      const lib = manifest.libraries?.find((l: { id: string }) => l.id === libraryId);
      if (!lib) return { customizableFields: [], gridfinityExtendedParams: {} };
      const indexResponse = await fetch(lib.path);
      if (!indexResponse.ok) return { customizableFields: [], gridfinityExtendedParams: {} };
      const data = await indexResponse.json();
      return {
        customizableFields: data.customizableFields ?? [],
        gridfinityExtendedParams: data.gridfinityExtendedParams ?? {},
      };
    } catch {
      return { customizableFields: [], gridfinityExtendedParams: {} };
    }
  }

  resolveImageUrl(_libraryId: string, imagePath: string): string {
    if (imagePath.startsWith('http')) return imagePath;
    return `${this.baseUrl}/images/${imagePath}`;
  }
}
