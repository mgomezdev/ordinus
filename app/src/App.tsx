import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './AppShell';
import { WorkspacePage } from './pages/WorkspacePage';
import { SettingsProvider } from './contexts/SettingsContext.js';

const SavedConfigsPage = lazy(() => import('./pages/SavedConfigsPage').then(m => ({ default: m.SavedConfigsPage })));
const OrderSummaryPage = lazy(() => import('./pages/OrderSummaryPage').then(m => ({ default: m.OrderSummaryPage })));

export default function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <Suspense>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<WorkspacePage />} />
              <Route path="configs" element={<SavedConfigsPage />} />
              <Route path="order" element={<OrderSummaryPage />} />
            </Route>
          </Routes>
        </Suspense>
      </SettingsProvider>
    </BrowserRouter>
  );
}
