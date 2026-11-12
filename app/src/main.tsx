import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from './api/queryClient'
import { DataSourceProvider } from './contexts/DataSourceContext'
import { CustomerProvider } from './contexts/CustomerContext'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AdminAuth } from './components/AdminAuth'
import { GuestPreviewPage } from './pages/GuestPreviewPage'

const queryClient = createQueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {window.location.pathname.startsWith('/guest/') ? <GuestPreviewPage linkId={window.location.pathname.split('/')[2] ?? ''} /> : <AdminAuth>
          <CustomerProvider>
            <DataSourceProvider>
              <App />
            </DataSourceProvider>
          </CustomerProvider>
        </AdminAuth>}
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
