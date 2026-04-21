/**
 * LibraryContext
 *
 * Focused context for library items, categories, and library metadata.
 * Consumers that only need library/catalog data should prefer `useLibrary`
 * over the broader `useWorkspace` hook.
 *
 * This context is backed by `WorkspaceContext` — it is not a separate provider.
 * It re-reads the same underlying context and exposes a narrowed slice.
 */
import { createContext, useContext } from 'react';
import type { LibraryItem, LibraryMeta, Category } from '../types/gridfinity';

export interface LibraryContextValue {
  // All library items across loaded libraries
  libraryItems: LibraryItem[];
  isLibraryLoading: boolean;
  isLibrariesLoading: boolean;
  libraryError: Error | null;
  librariesError: Error | null;

  // Derived categories from library items
  categories: Category[];

  // Lookup helpers
  getItemById: (prefixedId: string) => LibraryItem | undefined;
  getLibraryMeta: (libraryId: string) => Promise<LibraryMeta>;

  // Refresh triggers
  refreshLibraries: () => Promise<void>;
  refreshLibrary: () => Promise<void>;

  // Metadata for the currently selected item's library
  selectedLibraryMeta: LibraryMeta;
}

export const LibraryContext = createContext<LibraryContextValue | null>(null);

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within WorkspaceProvider');
  return ctx;
}
