import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataSourceProvider } from '../contexts/DataSourceContext';
import type { DataSourceAdapter } from '../api/adapters/types';
import type { LibraryItem, LibraryMeta } from '../types/gridfinity';
import type { ReactNode } from 'react';

// Default mock adapter for testing
export const defaultMockAdapter: DataSourceAdapter = {
  async getLibraries() {
    return [];
  },
  async getLibraryItems() {
    return [];
  },
  async getLibraryMeta(): Promise<LibraryMeta> {
    return { customizableFields: [], customizationDefaults: {} };
  },
  resolveImageUrl(libraryId: string, imagePath: string) {
    if (imagePath.startsWith('/libraries/') || imagePath.startsWith('http')) {
      return imagePath;
    }
    return `/libraries/${libraryId}/${imagePath}`;
  },
};

export function createMockAdapter(
  overrides?: Partial<DataSourceAdapter>
): DataSourceAdapter {
  return { ...defaultMockAdapter, ...overrides };
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

export function createTestWrapper(overrides?: Partial<DataSourceAdapter>) {
  const mockAdapter = createMockAdapter(overrides);
  const testQueryClient = createTestQueryClient();

  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={testQueryClient}>
        <DataSourceProvider adapter={mockAdapter}>
          {children}
        </DataSourceProvider>
      </QueryClientProvider>
    );
  };
}

/**
 * Create a test wrapper with a specific adapter and optional QueryClient.
 * Useful when you need to control the adapter or QueryClient instance directly.
 */
export function createTestWrapperWithAdapter(
  adapter: DataSourceAdapter,
  queryClient?: QueryClient
) {
  const testQueryClient = queryClient ?? createTestQueryClient();

  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={testQueryClient}>
        <DataSourceProvider adapter={adapter}>
          {children}
        </DataSourceProvider>
      </QueryClientProvider>
    );
  };
}

/**
 * Create a mock adapter that returns items for specific libraries.
 * Useful for useLibraryData tests.
 */
export function createLibraryMockAdapter(
  libraryItems: Record<string, LibraryItem[]>,
  libraryInfos?: Array<{
    id: string;
    name: string;
    path: string;
    itemCount?: number;
  }>
): DataSourceAdapter {
  return {
    async getLibraries() {
      if (libraryInfos) return libraryInfos;
      return Object.keys(libraryItems).map((id) => ({
        id,
        name: id,
        path: `/libraries/${id}/index.json`,
        itemCount: libraryItems[id].length,
      }));
    },
    async getLibraryItems(libraryId: string) {
      const items = libraryItems[libraryId];
      if (!items) return [];
      return items;
    },
    async getLibraryMeta(): Promise<LibraryMeta> {
      return { customizableFields: [], customizationDefaults: {} };
    },
    resolveImageUrl(_libraryId: string, imagePath: string) {
      return imagePath;
    },
  };
}
