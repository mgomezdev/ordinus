import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SaveLayoutDialog } from './SaveLayoutDialog';

const mockSaveAsync = vi.fn();
vi.mock('../../hooks/useLayouts', () => ({
  useSaveLayoutMutation: () => ({
    mutateAsync: mockSaveAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  gridX: 4,
  gridY: 4,
  widthMm: 168,
  depthMm: 168,
  spacerConfig: { horizontal: 'none' as const, vertical: 'none' as const },
  placedItems: [],
};

describe('SaveLayoutDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    render(<SaveLayoutDialog {...baseProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the dialog with Save Layout title', () => {
    render(<SaveLayoutDialog {...baseProps} />);
    expect(screen.getByRole('dialog', { name: /save layout/i })).toBeInTheDocument();
  });

  it('does NOT render an Update button for any props combination', () => {
    render(<SaveLayoutDialog {...baseProps} currentLayoutId={42} currentLayoutName="My Layout" />);
    expect(screen.queryByRole('button', { name: /update/i })).not.toBeInTheDocument();
  });

  it('renders a single primary Save button', () => {
    render(<SaveLayoutDialog {...baseProps} />);
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
  });

  it('pre-fills name field when currentLayoutName is provided', () => {
    render(<SaveLayoutDialog {...baseProps} currentLayoutId={42} currentLayoutName="Existing Layout" />);
    expect(screen.getByDisplayValue('Existing Layout')).toBeInTheDocument();
  });

  it('does NOT render the archived layout notice', () => {
    render(<SaveLayoutDialog {...baseProps} currentLayoutId={42} currentLayoutName="Archived" />);
    expect(screen.queryByText(/archived/i)).not.toBeInTheDocument();
  });

  it('Save button is disabled when name is empty', () => {
    render(<SaveLayoutDialog {...baseProps} />);
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeDisabled();
  });

  it('Save button is enabled when name is non-empty', () => {
    render(<SaveLayoutDialog {...baseProps} />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'My Layout' } });
    expect(screen.getByRole('button', { name: /^save$/i })).not.toBeDisabled();
  });

  it('Enter key always triggers the save-new path, never update', () => {
    const onSaveComplete = vi.fn();
    mockSaveAsync.mockResolvedValueOnce({ id: 1, name: 'Test Layout', status: 'draft' });

    render(
      <SaveLayoutDialog
        {...baseProps}
        currentLayoutId={42}
        currentLayoutName="Existing Layout"
        onSaveComplete={onSaveComplete}
      />,
    );

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Test Layout' } });
    fireEvent.keyDown(screen.getByRole('dialog').parentElement!, { key: 'Enter' });

    expect(mockSaveAsync).toHaveBeenCalledTimes(1);
  });
});
