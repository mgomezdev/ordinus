import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BomGenerationPanel } from './BomGenerationPanel';

vi.mock('../api/bomGeneration.api', () => ({
  triggerBomGeneration: vi.fn(),
  getBomGeneration: vi.fn(),
  getFileDownloadUrl: vi.fn((id: number, filename: string) => `/api/bom/${id}/${filename}`),
}));

import * as bomApi from '../api/bomGeneration.api';

const baseProps = {
  layoutId: 1,
  bomItems: [],
  accessToken: 'tok',
};

describe('BomGenerationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bomApi.getBomGeneration).mockResolvedValue(null);
  });

  it('shows Generate button when no generation exists', async () => {
    render(<BomGenerationPanel {...baseProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument();
  });

  it('shows Regenerate button when generation is ready', async () => {
    vi.mocked(bomApi.getBomGeneration).mockResolvedValue({
      id: 1, layoutId: 1, status: 'ready',
      fileManifest: [{ filename: 'bom.3mf', widthUnits: 2, heightUnits: 3, qty: 1 }],
      threeMfPath: '/out/bom.3mf',
      generatedAt: '2024-01-01T00:00:00Z',
      errorMessage: null,
    });
    render(<BomGenerationPanel {...baseProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument());
  });

  it('Download 3MF button is disabled until status is ready', async () => {
    render(<BomGenerationPanel {...baseProps} />);
    await waitFor(() => screen.getByRole('button', { name: /download 3mf/i }));
    expect(screen.getByRole('button', { name: /download 3mf/i })).toBeDisabled();
  });

  it('Download 3MF button enabled when ready', async () => {
    vi.mocked(bomApi.getBomGeneration).mockResolvedValue({
      id: 1, layoutId: 1, status: 'ready',
      fileManifest: [{ filename: 'bom-layout-1.3mf', widthUnits: 2, heightUnits: 3, qty: 1 }],
      threeMfPath: '/out/bom-layout-1.3mf',
      generatedAt: '2024-01-01T00:00:00Z',
      errorMessage: null,
    });
    render(<BomGenerationPanel {...baseProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /download 3mf/i })).not.toBeDisabled());
  });

  it('calls triggerBomGeneration when Generate is clicked', async () => {
    vi.mocked(bomApi.triggerBomGeneration).mockResolvedValue({
      id: 1, layoutId: 1, status: 'generating',
      fileManifest: null, threeMfPath: null, generatedAt: null, errorMessage: null,
    });
    render(<BomGenerationPanel {...baseProps} />);
    await waitFor(() => screen.getByRole('button', { name: /generate/i }));
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => expect(bomApi.triggerBomGeneration).toHaveBeenCalledWith(1, [], 'tok'));
  });

  it('shows error message when status is error', async () => {
    vi.mocked(bomApi.getBomGeneration).mockResolvedValue({
      id: 1, layoutId: 1, status: 'error',
      fileManifest: null, threeMfPath: null, generatedAt: null,
      errorMessage: 'Python failed',
    });
    render(<BomGenerationPanel {...baseProps} />);
    await waitFor(() => expect(screen.getByText(/python failed/i)).toBeInTheDocument());
  });
});
