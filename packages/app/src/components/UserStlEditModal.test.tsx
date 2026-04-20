import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { UserStlEditModal } from './UserStlEditModal.js';
import type { ApiUserStl } from '@gridfinity/shared';

const mockItem: ApiUserStl = {
  id: '1', name: 'My Bin', gridX: 2, gridY: 1, status: 'ready',
  imageUrl: null, perspImageUrls: [], errorMessage: null, createdAt: '',
};

vi.mock('../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { role: 'user' }, getAccessToken: () => 'tok', isAuthenticated: true }),
}));

const mockUpdate = vi.fn();
const mockDelete = vi.fn();
vi.mock('../hooks/useUserStls.js', () => ({
  useUpdateUserStlMutation: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useDeleteUserStlMutation: () => ({ mutateAsync: mockDelete, isPending: false }),
  useReprocessUserStlMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReplaceUserStlFileMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('UserStlEditModal', () => {
  beforeEach(() => { mockUpdate.mockReset(); mockDelete.mockReset(); });

  it('pre-fills name and grid values from item', () => {
    render(<UserStlEditModal item={mockItem} onClose={vi.fn()} />, { wrapper });
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('My Bin');
    expect((screen.getByLabelText(/grid x/i) as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText(/grid y/i) as HTMLInputElement).value).toBe('1');
  });

  it('calls update mutation and closes on save', async () => {
    mockUpdate.mockResolvedValue(mockItem);
    const onClose = vi.fn();
    render(<UserStlEditModal item={mockItem} onClose={onClose} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('shows confirm dialog before deleting', async () => {
    render(<UserStlEditModal item={mockItem} onClose={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(await screen.findByText(/are you sure/i)).toBeInTheDocument();
  });

  it('does not show Reprocess button for non-admin users', () => {
    render(<UserStlEditModal item={mockItem} onClose={vi.fn()} />, { wrapper });
    expect(screen.queryByRole('button', { name: /reprocess/i })).not.toBeInTheDocument();
  });
});
