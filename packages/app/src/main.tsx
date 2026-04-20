import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from './api/queryClient'
import { DataSourceProvider } from './contexts/DataSourceContext'
import { AuthProvider } from './contexts/AuthContext'
import { WalkthroughProvider } from './contexts/WalkthroughContext'
import { migrateStoredItems, migrateLibrarySelection } from './utils/migration'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

// Run migrations before React renders so useState initializers see clean data
migrateStoredItems()
migrateLibrarySelection()

const queryClient = createQueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WalkthroughProvider>
            <DataSourceProvider>
              <App />
            </DataSourceProvider>
          </WalkthroughProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
