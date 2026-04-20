import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { UserStlLibrarySection } from './UserStlLibrarySection.js';

vi.mock('../contexts/AuthContext.js', () => ({
  useAuth: () => ({ getAccessToken: () => 'tok', isAuthenticated: true }),
}));

// Mutable reference so individual tests can override data
let mockData = [
  {
    id: '1', name: 'Pending Item', status: 'pending', gridX: null, gridY: null,
    imageUrl: null, perspImageUrls: [], errorMessage: null, createdAt: '',
  },
  {
    id: '2', name: 'Ready Item', status: 'ready', gridX: 2, gridY: 1,
    imageUrl: 'img.png', perspImageUrls: [], errorMessage: null, createdAt: '',
  },
  {
    id: '3', name: 'Error Item', status: 'error', gridX: null, gridY: null,
    imageUrl: null, perspImageUrls: [], errorMessage: 'Parse failed', createdAt: '',
  },
];

vi.mock('../hooks/useUserStls.js', () => ({
  useUserStlsQuery: () => ({ data: mockData, isLoading: false }),
  useUploadUserStlMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateUserStlMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteUserStlMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReprocessUserStlMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReplaceUserStlFileMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('UserStlLibrarySection', () => {
  it('shows pending spinner for pending items', () => {
    render(<UserStlLibrarySection />, { wrapper });
    expect(screen.getByText('Pending Item')).toBeInTheDocument();
    expect(screen.getByTitle(/processing/i)).toBeInTheDocument();
  });

  it('makes ready items draggable', () => {
    render(<UserStlLibrarySection />, { wrapper });
    const readyItem = screen.getByText('Ready Item').closest('[draggable]');
    expect(readyItem).toHaveAttribute('draggable', 'true');
  });

  it('shows error badge with message for error items', () => {
    render(<UserStlLibrarySection />, { wrapper });
    expect(screen.getByTitle('Parse failed')).toBeInTheDocument();
  });

  it('shows empty state when no items', () => {
    const saved = mockData;
    mockData = [];
    render(<UserStlLibrarySection />, { wrapper });
    expect(screen.getByText(/no models yet/i)).toBeInTheDocument();
    mockData = saved;
  });

  it('opens upload modal when Upload model is clicked', () => {
    render(<UserStlLibrarySection />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /upload model/i }));
    expect(screen.getByRole('heading', { name: /upload model/i })).toBeInTheDocument();
  });
});
