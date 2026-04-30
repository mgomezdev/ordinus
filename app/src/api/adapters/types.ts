import type { LibraryItem, LibraryMeta } from '../../types/gridfinity';

export interface LibraryInfo {
  id: string;
  name: string;
  path: string;
  description?: string;
  itemCount?: number;
}

export interface DataSourceAdapter {
  getLibraries(): Promise<LibraryInfo[]>;
  getLibraryItems(libraryId: string): Promise<LibraryItem[]>;
  getLibraryMeta(libraryId: string): Promise<LibraryMeta>;
  resolveImageUrl(libraryId: string, imagePath: string): string;
}
