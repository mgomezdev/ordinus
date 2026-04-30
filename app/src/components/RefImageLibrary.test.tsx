/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ApiRefImage } from '@gridfinity/shared';
import { RefImageLibrary } from './RefImageLibrary';
import { useRefImagesQuery, useUploadRefImageMutation, useUploadGlobalRefImageMutation, useRenameRefImageMutation, useDeleteRefImageMutation } from '../hooks/useRefImages';
import { useAuth } from '../contexts/AuthContext';
import { RefImageCard } from './RefImageCard';

vi.mock('../hooks/useRefImages', () => ({
  useRefImagesQuery: vi.fn(),
  useUploadRefImageMutation: vi.fn(),
  useUploadGlobalRefImageMutation: vi.fn(),
  useRenameRefImageMutation: vi.fn(),
  useDeleteRefImageMutation: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('./RefImageCard', () => ({
  RefImageCard: vi.fn(({ image }: { image: { name: string } }) => (
    <div data-testid={`ref-card-${image.name}`}>{image.name}</div>
  )),
}));

describe('RefImageLibrary', () => {
  const personalImage: ApiRefImage = {
    id: 1,
    ownerId: 1,
    name: 'my-image.png',
    isGlobal: false,
    imageUrl: 'ref-lib/a.webp',
    fileSize: 1024,
    createdAt: '2024-01-01'
  };

  const globalImage: ApiRefImage = {
    id: 2,
    ownerId: null,
    name: 'shared-bg.png',
    isGlobal: true,
    imageUrl: 'ref-lib/b.webp',
    fileSize: 2048,
    createdAt: '2024-01-01'
  };

  const mockMutateAsync = vi.fn();
  const mockUploadMutation = {
    mutateAsync: mockMutateAsync,
    mutate: vi.fn(),
    isPending: false
  };

  const mockUploadGlobalMutation = {
    mutateAsync: mockMutateAsync,
    mutate: vi.fn(),
    isPending: false
  };

  const mockRenameMutation = {
    mutateAsync: vi.fn(),
    mutate: vi.fn(),
    isPending: false
  };

  const mockDeleteMutation = {
    mutateAsync: vi.fn(),
    mutate: vi.fn(),
    isPending: false
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 1,
        email: 'test@test.com',
        username: 'testuser',
        role: 'user',
        createdAt: ''
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn().mockReturnValue('token'),
    });

    vi.mocked(useRefImagesQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useUploadRefImageMutation).mockReturnValue(mockUploadMutation as any);
    vi.mocked(useUploadGlobalRefImageMutation).mockReturnValue(mockUploadGlobalMutation as any);
    vi.mocked(useRenameRefImageMutation).mockReturnValue(mockRenameMutation as any);
    vi.mocked(useDeleteRefImageMutation).mockReturnValue(mockDeleteMutation as any);
  });

  describe('Rendering', () => {
    it('renders title "Reference Images"', () => {
      render(<RefImageLibrary />);

      expect(screen.getByText('Reference Images')).toBeInTheDocument();
    });

    it('renders hint text', () => {
      render(<RefImageLibrary />);

      expect(screen.getByText('Drag images onto the grid')).toBeInTheDocument();
    });

    it('renders Upload Image button', () => {
      render(<RefImageLibrary />);

      expect(screen.getByRole('button', { name: 'Upload Image' })).toBeInTheDocument();
    });

    it('does NOT render "Upload as Shared" button for regular user', () => {
      render(<RefImageLibrary />);

      expect(screen.queryByRole('button', { name: 'Upload as Shared' })).not.toBeInTheDocument();
    });

    it('renders "Upload as Shared" button for admin user', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 1,
          email: 'admin@test.com',
          username: 'admin',
          role: 'admin',
          createdAt: ''
        },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        getAccessToken: vi.fn().mockReturnValue('token'),
      });

      render(<RefImageLibrary />);

      expect(screen.getByRole('button', { name: 'Upload as Shared' })).toBeInTheDocument();
    });
  });

  describe('Loading/Error states', () => {
    it('shows loading message when query is loading', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      expect(screen.getByText('Loading images...')).toBeInTheDocument();
    });

    it('shows error message when query has error', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Network error'),
      } as any);

      render(<RefImageLibrary />);

      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });

    it('does not show sections while loading', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      expect(screen.queryByText(/My Images/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Shared Images/)).not.toBeInTheDocument();
    });
  });

  describe('Image sections', () => {
    it('shows "My Images" section with personal image count', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [personalImage],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      expect(screen.getByText('My Images (1)')).toBeInTheDocument();
    });

    it('shows "Shared Images" section when global images exist', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [globalImage],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      expect(screen.getByText('Shared Images (1)')).toBeInTheDocument();
    });

    it('does not show "Shared Images" section when no global images', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [personalImage],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      expect(screen.queryByText(/Shared Images/)).not.toBeInTheDocument();
    });

    it('shows empty state message when no personal images', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      expect(screen.getByText('No personal images yet. Upload one above.')).toBeInTheDocument();
    });
  });

  describe('Collapsible sections', () => {
    it('toggles "My Images" collapsed state on click', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [personalImage],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      const myImagesTitle = screen.getByText('My Images (1)');
      const grid = myImagesTitle.nextElementSibling;

      expect(grid).toHaveClass('expanded');

      fireEvent.click(myImagesTitle);

      expect(grid).toHaveClass('collapsed');

      fireEvent.click(myImagesTitle);

      expect(grid).toHaveClass('expanded');
    });

    it('toggles "Shared Images" collapsed state on click', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [globalImage],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      const sharedImagesTitle = screen.getByText('Shared Images (1)');
      const grid = sharedImagesTitle.nextElementSibling;

      expect(grid).toHaveClass('expanded');

      fireEvent.click(sharedImagesTitle);

      expect(grid).toHaveClass('collapsed');

      fireEvent.click(sharedImagesTitle);

      expect(grid).toHaveClass('expanded');
    });
  });

  describe('Upload', () => {
    it('shows "Uploading..." when upload is pending', () => {
      const pendingMutation = {
        mutateAsync: vi.fn(),
        mutate: vi.fn(),
        isPending: true
      };

      vi.mocked(useUploadRefImageMutation).mockReturnValue(pendingMutation as any);

      render(<RefImageLibrary />);

      expect(screen.getByRole('button', { name: 'Uploading...' })).toBeInTheDocument();
    });

    it('disables upload buttons when uploading', () => {
      const pendingMutation = {
        mutateAsync: vi.fn(),
        mutate: vi.fn(),
        isPending: true
      };

      vi.mocked(useUploadRefImageMutation).mockReturnValue(pendingMutation as any);
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 1,
          email: 'admin@test.com',
          username: 'admin',
          role: 'admin',
          createdAt: ''
        },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        getAccessToken: vi.fn().mockReturnValue('token'),
      });

      render(<RefImageLibrary />);

      const uploadButtons = screen.getAllByRole('button', { name: /Upload/ });
      uploadButtons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });

    it('shows error for non-image file type', async () => {
      render(<RefImageLibrary />);

      const fileInput = screen.getByLabelText('Upload reference image');
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(await screen.findByRole('alert')).toHaveTextContent('Please select a valid image file');
    });

    it('uploads personal image when Upload Image button is clicked', async () => {
      mockMutateAsync.mockResolvedValue(undefined);

      render(<RefImageLibrary />);

      const uploadButton = screen.getByRole('button', { name: 'Upload Image' });
      fireEvent.click(uploadButton);

      const fileInput = screen.getByLabelText('Upload reference image');
      const file = new File(['image'], 'test.png', { type: 'image/png' });

      await fireEvent.change(fileInput, { target: { files: [file] } });

      expect(mockUploadMutation.mutateAsync).toHaveBeenCalledWith(file);
    });

    it('uploads global image when Upload as Shared button is clicked', async () => {
      mockMutateAsync.mockResolvedValue(undefined);

      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 1,
          email: 'admin@test.com',
          username: 'admin',
          role: 'admin',
          createdAt: ''
        },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        getAccessToken: vi.fn().mockReturnValue('token'),
      });

      render(<RefImageLibrary />);

      const uploadButton = screen.getByRole('button', { name: 'Upload as Shared' });
      fireEvent.click(uploadButton);

      const fileInput = screen.getByLabelText('Upload reference image');
      const file = new File(['image'], 'test.png', { type: 'image/png' });

      await fireEvent.change(fileInput, { target: { files: [file] } });

      expect(mockUploadGlobalMutation.mutateAsync).toHaveBeenCalledWith(file);
    });

    it('shows error message when upload fails', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Upload failed'));

      render(<RefImageLibrary />);

      const fileInput = screen.getByLabelText('Upload reference image');
      const file = new File(['image'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');
      });
    });

    it('clears upload error when new upload is initiated', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Upload failed'));

      render(<RefImageLibrary />);

      const fileInput = screen.getByLabelText('Upload reference image');
      const file = new File(['image'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');
      });

      mockMutateAsync.mockResolvedValue(undefined);

      const uploadButton = screen.getByRole('button', { name: 'Upload Image' });
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });

    it('resets file input after successful upload', async () => {
      mockMutateAsync.mockResolvedValue(undefined);

      render(<RefImageLibrary />);

      const fileInput = screen.getByLabelText('Upload reference image') as HTMLInputElement;
      const file = new File(['image'], 'test.png', { type: 'image/png' });

      Object.defineProperty(fileInput, 'value', {
        writable: true,
        value: 'test.png'
      });

      await fireEvent.change(fileInput, { target: { files: [file] } });

      expect(fileInput.value).toBe('');
    });
  });

  describe('RefImageCard integration', () => {
    it('passes onDelete callback for personal images', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [personalImage],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      const calls = vi.mocked(RefImageCard).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toMatchObject({
        image: personalImage,
      });
      expect(calls[0][0].onDelete).toBeTypeOf('function');
      expect(calls[0][0].onRename).toBeTypeOf('function');
    });

    it('passes onDelete callback for global images when user is admin', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 1,
          email: 'admin@test.com',
          username: 'admin',
          role: 'admin',
          createdAt: ''
        },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        getAccessToken: vi.fn().mockReturnValue('token'),
      });

      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [globalImage],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      const calls = vi.mocked(RefImageCard).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toMatchObject({
        image: globalImage,
      });
      expect(calls[0][0].onDelete).toBeTypeOf('function');
      expect(calls[0][0].onRename).toBeTypeOf('function');
    });

    it('does not pass onDelete callback for global images when user is not admin', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [globalImage],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      const calls = vi.mocked(RefImageCard).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toMatchObject({
        image: globalImage,
        onDelete: undefined,
        onRename: undefined,
      });
    });

    it('passes onRename callback only for admin users', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [globalImage],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      const calls = vi.mocked(RefImageCard).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0].onRename).toBeUndefined();
    });
  });

  describe('Keyboard accessibility', () => {
    it('toggles "My Images" on Enter key', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [personalImage],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      const myImagesTitle = screen.getByText('My Images (1)');
      const grid = myImagesTitle.nextElementSibling;

      expect(grid).toHaveClass('expanded');

      fireEvent.keyDown(myImagesTitle, { key: 'Enter' });

      expect(grid).toHaveClass('collapsed');
    });

    it('toggles "My Images" on Space key', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [personalImage],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      const myImagesTitle = screen.getByText('My Images (1)');
      const grid = myImagesTitle.nextElementSibling;

      expect(grid).toHaveClass('expanded');

      fireEvent.keyDown(myImagesTitle, { key: ' ' });

      expect(grid).toHaveClass('collapsed');
    });

    it('toggles "Shared Images" on Enter key', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [globalImage],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      const sharedImagesTitle = screen.getByText('Shared Images (1)');
      const grid = sharedImagesTitle.nextElementSibling;

      expect(grid).toHaveClass('expanded');

      fireEvent.keyDown(sharedImagesTitle, { key: 'Enter' });

      expect(grid).toHaveClass('collapsed');
    });

    it('does not toggle on other keys', () => {
      vi.mocked(useRefImagesQuery).mockReturnValue({
        data: [personalImage],
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(<RefImageLibrary />);

      const myImagesTitle = screen.getByText('My Images (1)');
      const grid = myImagesTitle.nextElementSibling;

      expect(grid).toHaveClass('expanded');

      fireEvent.keyDown(myImagesTitle, { key: 'a' });

      expect(grid).toHaveClass('expanded');
    });
  });
});
