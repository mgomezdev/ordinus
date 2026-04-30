import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReferenceImageUploader } from './ReferenceImageUploader';

describe('ReferenceImageUploader', () => {
  let mockOnUpload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnUpload = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render upload button', () => {
      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const button = screen.getByRole('button', { name: /upload reference image/i });
      expect(button).toBeInTheDocument();
    });

    it('should render file input with correct attributes', () => {
      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i);
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute('type', 'file');
      expect(fileInput).toHaveAttribute('accept', 'image/*');
      expect(fileInput).toHaveStyle({ display: 'none' });
    });

    it('should have hidden file input', () => {
      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i);
      expect(fileInput).toHaveStyle({ display: 'none' });
    });

    it('should only accept image files', () => {
      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i);
      expect(fileInput).toHaveAttribute('accept', 'image/*');
    });
  });

  describe('Button Interaction', () => {
    it('should trigger file input click when button is clicked', () => {
      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click');

      const button = screen.getByRole('button', { name: /upload reference image/i });
      fireEvent.click(button);

      expect(clickSpy).toHaveBeenCalledTimes(1);
      clickSpy.mockRestore();
    });

    it('should not be disabled initially', () => {
      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const button = screen.getByRole('button', { name: /upload reference image/i });
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'false');
    });
  });

  describe('File Upload', () => {
    it('should call onUpload with selected file', async () => {
      mockOnUpload.mockResolvedValue(undefined);

      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledWith(file);
        expect(mockOnUpload).toHaveBeenCalledTimes(1);
      });
    });

    it('should not call onUpload when no file is selected', () => {
      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [] } });

      expect(mockOnUpload).not.toHaveBeenCalled();
    });

    it('should accept various image formats', async () => {
      mockOnUpload.mockResolvedValue(undefined);

      const imageFormats = [
        { name: 'test.png', type: 'image/png' },
        { name: 'test.jpg', type: 'image/jpeg' },
        { name: 'test.gif', type: 'image/gif' },
        { name: 'test.webp', type: 'image/webp' },
        { name: 'test.svg', type: 'image/svg+xml' },
      ];

      for (const format of imageFormats) {
        mockOnUpload.mockClear();
        const { unmount } = render(<ReferenceImageUploader onUpload={mockOnUpload} />);

        const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
        const file = new File(['image content'], format.name, { type: format.type });

        fireEvent.change(fileInput, { target: { files: [file] } });

        await waitFor(() => {
          expect(mockOnUpload).toHaveBeenCalledWith(file);
        });

        unmount();
      }
    });
  });

  describe('Loading State', () => {
    it('should show loading state during upload', async () => {
      const slowUpload = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));

      render(<ReferenceImageUploader onUpload={slowUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      // Check loading state is shown
      await waitFor(() => {
        const button = screen.getByRole('button', { name: /uploading/i });
        expect(button).toBeInTheDocument();
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
      });

      // Wait for upload to complete
      await waitFor(() => {
        expect(slowUpload).toHaveBeenCalled();
      });
    });

    it('should disable button during upload', async () => {
      const slowUpload = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));

      render(<ReferenceImageUploader onUpload={slowUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        const button = screen.getByRole('button');
        expect(button).toBeDisabled();
      });
    });

    it('should change button text to "Uploading..." during upload', async () => {
      const slowUpload = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));

      render(<ReferenceImageUploader onUpload={slowUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText('Uploading...')).toBeInTheDocument();
      });
    });

    it('should restore button state after successful upload', async () => {
      mockOnUpload.mockResolvedValue(undefined);

      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        const button = screen.getByRole('button', { name: /upload reference image/i });
        expect(button).not.toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'false');
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when upload fails', async () => {
      mockOnUpload.mockRejectedValue(new Error('Upload failed'));

      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveTextContent('Upload failed');
      });
    });

    it('should show generic error message for non-Error exceptions', async () => {
      mockOnUpload.mockRejectedValue('Unknown error');

      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toHaveTextContent('Failed to upload image');
      });
    });

    it('should restore button state after failed upload', async () => {
      mockOnUpload.mockRejectedValue(new Error('Upload failed'));

      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        const button = screen.getByRole('button', { name: /upload reference image/i });
        expect(button).not.toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'false');
      });
    });

    it('should reject non-image files', async () => {
      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['text content'], 'test.txt', { type: 'text/plain' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toHaveTextContent('Please select a valid image file');
      });

      expect(mockOnUpload).not.toHaveBeenCalled();
    });

    it('should clear previous error before new upload', async () => {
      mockOnUpload
        .mockRejectedValueOnce(new Error('First upload failed'))
        .mockResolvedValueOnce(undefined);

      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file1 = new File(['image content'], 'test1.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file1] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const file2 = new File(['image content'], 'test2.png', { type: 'image/png' });
      fireEvent.change(fileInput, { target: { files: [file2] } });

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });

    it('should validate file type before calling onUpload', async () => {
      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(mockOnUpload).not.toHaveBeenCalled();
    });
  });

  describe('File Input Reset', () => {
    it('should reset file input after successful upload', async () => {
      mockOnUpload.mockResolvedValue(undefined);

      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalled();
      });

      expect(fileInput.value).toBe('');
    });

    it('should reset file input after failed upload', async () => {
      mockOnUpload.mockRejectedValue(new Error('Upload failed'));

      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(fileInput.value).toBe('');
    });

    it('should allow re-selecting the same file after upload', async () => {
      mockOnUpload.mockResolvedValue(undefined);

      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.png', { type: 'image/png' });

      // First upload
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledTimes(1);
      });

      expect(fileInput.value).toBe('');

      // Second upload with same file
      mockOnUpload.mockClear();
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria-label on file input', () => {
      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i);
      expect(fileInput).toHaveAttribute('aria-label', 'Upload reference image');
    });

    it('should set aria-busy during upload', async () => {
      const slowUpload = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));

      render(<ReferenceImageUploader onUpload={slowUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.png', { type: 'image/png' });

      const buttonBefore = screen.getByRole('button');
      expect(buttonBefore).toHaveAttribute('aria-busy', 'false');

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        const buttonDuring = screen.getByRole('button');
        expect(buttonDuring).toHaveAttribute('aria-busy', 'true');
      });
    });

    it('should use role="alert" for error messages', async () => {
      mockOnUpload.mockRejectedValue(new Error('Upload failed'));

      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null file input ref gracefully', () => {
      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const button = screen.getByRole('button');

      expect(() => fireEvent.click(button)).not.toThrow();
    });

    it('should handle multiple rapid uploads', async () => {
      mockOnUpload.mockResolvedValue(undefined);

      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file1 = new File(['image content'], 'test1.png', { type: 'image/png' });
      const file2 = new File(['image content'], 'test2.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file1] } });
      fireEvent.change(fileInput, { target: { files: [file2] } });

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledTimes(2);
      });
    });

    it('should not break on files without file type', async () => {
      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['content'], 'noextension', { type: '' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Please select a valid image file');
      });
    });

    it('should handle file with image mime type but wrong extension', async () => {
      mockOnUpload.mockResolvedValue(undefined);

      render(<ReferenceImageUploader onUpload={mockOnUpload} />);

      const fileInput = screen.getByLabelText(/upload reference image/i) as HTMLInputElement;
      const file = new File(['image content'], 'test.txt', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledWith(file);
      });
    });
  });
});
