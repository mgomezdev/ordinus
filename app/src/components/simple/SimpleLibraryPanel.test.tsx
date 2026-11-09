import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CuratedLibrary } from '@gridfinity/shared';
import { SimpleLibraryPanel } from './SimpleLibraryPanel';

const mocks = vi.hoisted(() => ({ place: vi.fn(), save: vi.fn(), remove: vi.fn(), libraries: [] as CuratedLibrary[], error: null as Error | null }));
vi.mock('../../hooks/useCuratedLibraries', () => ({ useCuratedLibraries: () => ({ libraries: mocks.libraries, error: mocks.error, isLoading: false, refetch: vi.fn(), save: { mutateAsync: mocks.save }, remove: { mutateAsync: mocks.remove } }) }));
vi.mock('../../contexts/WorkspaceContext', () => ({ useWorkspace: () => ({ libraryItems: [], getItemById: (id: string) => id === 'bins:fixed' ? { widthUnits: 3, heightUnits: 2 } : undefined, placeCuratedBin: mocks.place }) }));

const library: CuratedLibrary = { id: 'kitchen', name: 'Kitchen', description: 'Cutlery bins', entries: [
  { id: 'fixed', name: 'Fixed tray', kind: 'fixed', sourceId: 'bins:fixed', width: 3, depth: 2 },
  { id: 'missing', name: 'Missing tray', kind: 'fixed', sourceId: 'missing:fixed', width: 2, depth: 3 },
  { id: 'cup', name: 'Cup', kind: 'parametric', generator: 'basic-cup', width: { min: 0.5, max: 20, step: 0.5 }, depth: { min: 0.5, max: 20, step: 0.5 }, defaults: { height: 4 }, groups: [{ id: 'height', name: 'Height', choices: [{ id: 'short', name: 'Short', values: { height: 2 } }, { id: 'tall', name: 'Tall', values: { height: 6 } }] }] },
] };
const props = () => ({ width: 320, isMobile: false, isOpen: false, selection: { x: 0, y: 0, width: 4, depth: 6 }, valid: true, drawing: false, busy: false, onDraw: vi.fn(), onCancel: vi.fn(), onSelection: vi.fn(), onPlaced: vi.fn(), onBusy: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); mocks.libraries = [library]; mocks.error = null; mocks.place.mockResolvedValue(true); });

describe('simple library picker', () => {
  it('labels unavailable sources, resolves rotated fixed bins, and places the exact rectangle', async () => {
    const p = props(); render(<SimpleLibraryPanel {...p} />);
    expect(screen.getByRole('option', { name: 'Missing tray (Unsupported)' })).toBeInTheDocument();
    expect(screen.getByText('This bin will be rotated to fit.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Place bin' }));
    await waitFor(() => expect(p.onPlaced).toHaveBeenCalled());
    expect(mocks.place).toHaveBeenCalledWith(library.entries[0], 2, 3, {}, 0, 0);
  });
  it('shows friendly presets, handles errors and keeps a failed placement editable', async () => {
    mocks.place.mockRejectedValue(new Error('Generation unavailable'));
    const p = props(); render(<SimpleLibraryPanel {...p} />);
    fireEvent.change(screen.getByLabelText('Choose a bin'), { target: { value: 'cup' } });
    fireEvent.change(screen.getByLabelText('Height'), { target: { value: 'tall' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place bin' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Generation unavailable');
    expect(mocks.place).toHaveBeenCalledWith(library.entries[2], 2, 3, { height: 'tall' }, 0, 0);
    expect(p.onPlaced).not.toHaveBeenCalled();
    expect(p.onBusy).toHaveBeenLastCalledWith(false);
  });
  it('supports keyboard rectangle input and blocks invalid placement', () => {
    const p = props(); render(<SimpleLibraryPanel {...p} valid={false} />);
    expect(screen.getByRole('button', { name: 'Place bin' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use footprint' }));
    expect(p.onSelection).toHaveBeenCalledWith({ x: 0, y: 0, width: 3, depth: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(p.onCancel).toHaveBeenCalled();
  });
  it('accepts a touch release and deduplicates its following compatibility click', async () => {
    const p = props(); render(<SimpleLibraryPanel {...p} />);
    const button = screen.getByRole('button', { name: 'Place bin' });
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerUp(button, { pointerType: 'touch', isPrimary: true, clientX: 120, clientY: 20 });
    expect(mocks.place).not.toHaveBeenCalled();
    fireEvent.pointerUp(button, { pointerType: 'touch', isPrimary: true, clientX: 50, clientY: 20 });
    await waitFor(() => expect(p.onPlaced).toHaveBeenCalledOnce());
    fireEvent.click(button, { detail: 1 });
    expect(mocks.place).toHaveBeenCalledOnce();
  });
  it('explains no matches and exposes loading failures', () => {
    mocks.libraries = [{ ...library, entries: [library.entries[0]] }];
    mocks.error = new Error('Offline');
    render(<SimpleLibraryPanel {...props()} selection={{ x: 0, y: 0, width: 2, depth: 2 }} />);
    expect(screen.getByText(/No bins in this library/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place bin' })).toBeDisabled();
    expect(screen.getByText(/Width × depth not supported/)).toHaveTextContent('3 × 2');
  });
  it('lets users inspect an unsupported bin and recover by choosing a supported bin', () => {
    render(<SimpleLibraryPanel {...props()} />);
    fireEvent.change(screen.getByLabelText('Choose a bin'), { target: { value: 'missing' } });
    expect(screen.getByText(/The source bin is unavailable/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Place bin' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Place bin' }));
    expect(mocks.place).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Choose a bin'), { target: { value: 'cup' } });
    expect(screen.getByRole('button', { name: 'Place bin' })).toBeEnabled();
  });
  it.each([
    { selection: { x: 0, y: 0, width: 3, depth: 4 }, name: 'half-grid dimensions' },
    { selection: { x: 1, y: 0, width: 4, depth: 6 }, name: 'half-grid position' },
  ])('explains unsupported $name', ({ selection }) => {
    const cup = library.entries[2];
    if (cup.kind !== 'parametric') throw new Error('Expected parametric fixture');
    mocks.libraries = [{ ...library, entries: [{ ...cup, defaults: { sub_pitch: 1 } }] }];
    render(<SimpleLibraryPanel {...props()} selection={selection} />);
    expect(screen.getByRole('option', { name: 'Cup (Unsupported)' })).toBeInTheDocument();
    expect(screen.getByText(/Half-grid steps are not supported/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Place bin' })).toBeDisabled();
  });
  it('explains axis restrictions and selected preset restrictions', () => {
    const cup = library.entries[2];
    if (cup.kind !== 'parametric') throw new Error('Expected parametric fixture');
    mocks.libraries = [{ ...library, entries: [{ ...cup, width: { fixed: 1 }, depth: { values: [1, 2] } }] }];
    const view = render(<SimpleLibraryPanel {...props()} />);
    expect(screen.getByText(/Width × depth not supported/)).toHaveTextContent('width: 1; depth: 1, 2');
    mocks.libraries = [{ ...library, entries: [{ ...cup, groups: [{ id: 'size', name: 'Size', choices: [
      { id: 'fits', name: 'Fits', values: { width: 2, depth: 3 } },
      { id: 'wide', name: 'Wide', values: { width: 4, depth: 4 } },
    ] }] }] }];
    view.rerender(<SimpleLibraryPanel {...props()} />);
    expect(screen.getByRole('option', { name: 'Wide (Unsupported)' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: 'wide' } });
    expect(screen.getByText(/These presets do not support/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Place bin' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: 'fits' } });
    expect(screen.getByRole('button', { name: 'Place bin' })).toBeEnabled();
  });
  it('creates a library through the editor and persists parametric choices', async () => {
    mocks.save.mockResolvedValue({});
    render(<SimpleLibraryPanel {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'New library' }));
    fireEvent.change(screen.getByLabelText('Library name'), { target: { value: 'Silverware' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add parametric bin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add named option' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save library' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ existing: false, library: { name: 'Silverware', entries: [{ kind: 'parametric', groups: [{ name: 'Height', choices: [{ name: 'Short' }, { name: 'Medium' }, { name: 'Tall' }] }] }] } });
  });
});
