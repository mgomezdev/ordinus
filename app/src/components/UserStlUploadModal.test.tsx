import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { UserStlUploadModal } from './UserStlUploadModal.js';

vi.mock('../contexts/AuthContext.js', () => ({
  useAuth: () => ({ getAccessToken: () => 'tok', isAuthenticated: true }),
}));

const mockMutateAsync = vi.fn();
vi.mock('../hooks/useUserStls.js', () => ({
  useUploadUserStlMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    error: null,
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('UserStlUploadModal', () => {
  beforeEach(() => { mockMutateAsync.mockReset(); });

  it('shows error alert when no file selected and submitted', async () => {
    render(<UserStlUploadModal onClose={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows error for non-STL/3MF file', async () => {
    render(<UserStlUploadModal onClose={vi.fn()} />, { wrapper });
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/file/i);
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/stl|3mf/i);
  });

  it('pre-fills name from filename on file select', () => {
    render(<UserStlUploadModal onClose={vi.fn()} />, { wrapper });
    const file = new File(['bin'], 'my-widget.stl', { type: 'application/octet-stream' });
    const input = screen.getByLabelText(/file/i);
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('my-widget');
  });

  it('calls mutateAsync and closes modal on valid submit', async () => {
    mockMutateAsync.mockResolvedValue({ id: '1', status: 'pending' });
    const onClose = vi.fn();
    render(<UserStlUploadModal onClose={onClose} />, { wrapper });
    const file = new File(['binary'], 'widget.stl', { type: 'application/octet-stream' });
    const input = screen.getByLabelText(/file/i);
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({ file, name: 'widget' }));
    expect(onClose).toHaveBeenCalled();
  });
});
