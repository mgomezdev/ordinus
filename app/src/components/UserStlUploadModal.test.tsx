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
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({
      file,
      name: 'widget',
      opts: { gridX: 1, gridY: 1, gridZ: 3, visibility: 'private' },
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows grid dimension inputs for Width, Depth, and Height', () => {
    render(<UserStlUploadModal onClose={vi.fn()} />, { wrapper });
    expect(screen.getByText(/width/i)).toBeInTheDocument();
    expect(screen.getByText(/depth/i)).toBeInTheDocument();
    expect(screen.getByText(/height/i)).toBeInTheDocument();
  });

  it('shows Private and Public visibility radio buttons', () => {
    render(<UserStlUploadModal onClose={vi.fn()} />, { wrapper });
    expect(screen.getByRole('radio', { name: /private/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /public/i })).toBeInTheDocument();
  });

  it('shows hint text when Public visibility is selected', () => {
    render(<UserStlUploadModal onClose={vi.fn()} />, { wrapper });
    expect(screen.queryByText(/dimensions will be verified/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /public/i }));
    expect(screen.getByText(/dimensions will be verified/i)).toBeInTheDocument();
  });

  it('rejects non-.stl files with an error message', async () => {
    render(<UserStlUploadModal onClose={vi.fn()} />, { wrapper });
    const file = new File(['data'], 'model.obj', { type: 'application/octet-stream' });
    const input = screen.getByLabelText(/file/i);
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/stl/i);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
