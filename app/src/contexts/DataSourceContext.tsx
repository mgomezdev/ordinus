import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { DataSourceAdapter } from '../api/adapters/types';
import { StaticAdapter } from '../api/adapters/static.adapter';
import { ApiAdapter } from '../api/adapters/api.adapter';

const DataSourceContext = createContext<DataSourceAdapter | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useDataSource(): DataSourceAdapter {
  const adapter = useContext(DataSourceContext);
  if (!adapter) throw new Error('useDataSource must be used within DataSourceProvider');
  return adapter;
}

interface DataSourceProviderProps {
  children: ReactNode;
  adapter?: DataSourceAdapter;
}

export function DataSourceProvider({ children, adapter }: DataSourceProviderProps) {
  const defaultAdapter = useMemo(() => {
    if (adapter) return adapter;
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
    if (apiBaseUrl) return new ApiAdapter(apiBaseUrl);
    return new StaticAdapter();
  }, [adapter]);

  return (
    <DataSourceContext.Provider value={defaultAdapter}>
      {children}
    </DataSourceContext.Provider>
  );
}
