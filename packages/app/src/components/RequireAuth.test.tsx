import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';

let mockIsAuthenticated = false;
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

function renderWithRouter(authenticated: boolean) {
  mockIsAuthenticated = authenticated;
  return render(
    <MemoryRouter initialEntries={['/configs']}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/configs" element={
          <RequireAuth>
            <div>Protected Content</div>
          </RequireAuth>
        } />
      </Routes>
    </MemoryRouter>
  );
}

it('renders children when authenticated', () => {
  renderWithRouter(true);
  expect(screen.getByText('Protected Content')).toBeInTheDocument();
});

it('redirects to /?authRequired=1 when not authenticated', () => {
  renderWithRouter(false);
  expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  expect(screen.getByText('Home')).toBeInTheDocument();
});
