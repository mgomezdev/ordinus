import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './AppShell';
import { WorkspacePage } from './pages/WorkspacePage';
import { SavedConfigsPage } from './pages/SavedConfigsPage';
import { OrderSummaryPage } from './pages/OrderSummaryPage';
import { RequireAuth } from './components/RequireAuth';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<WorkspacePage />} />
          <Route path="configs" element={<RequireAuth><SavedConfigsPage /></RequireAuth>} />
          <Route path="order" element={<OrderSummaryPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
