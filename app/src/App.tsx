import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './AppShell';
import { WorkspacePage } from './pages/WorkspacePage';
import { RequireAuth } from './components/RequireAuth';

const SavedConfigsPage = lazy(() => import('./pages/SavedConfigsPage').then(m => ({ default: m.SavedConfigsPage })));
const OrderSummaryPage = lazy(() => import('./pages/OrderSummaryPage').then(m => ({ default: m.OrderSummaryPage })));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<WorkspacePage />} />
            <Route path="configs" element={<RequireAuth><SavedConfigsPage /></RequireAuth>} />
            <Route path="order" element={<OrderSummaryPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
