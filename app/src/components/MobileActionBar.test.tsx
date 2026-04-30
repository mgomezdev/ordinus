import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MobileActionBar } from './MobileActionBar';
import type { ImageViewMode } from '../types/gridfinity';

const baseProps = {
  isAuthenticated: true,
  layoutMeta: { id: 42, name: 'Test Layout' },
  placedItems: [{ instanceId: 'i1', itemId: 'lib:item', x: 0, y: 0, width: 1, height: 1, rotation: 0 }],
  refImagePlacements: [],
  isSaving: false,
  imageViewMode: 'ortho' as ImageViewMode,
  onSave: vi.fn(),
  onSaveAsNew: vi.fn(),
  onLoad: vi.fn(),
  onExport: vi.fn().mockResolvedValue(undefined),
  onToggleView: vi.fn(),
  onClearAll: vi.fn(),
};

describe('MobileActionBar', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('rendering', () => {
    it('renders all 5 action buttons when authenticated', () => {
      render(<MobileActionBar {...baseProps} />);
      expect(screen.getByLabelText('Load layout')).toBeInTheDocument();
      expect(screen.getByLabelText('Save layout')).toBeInTheDocument();
      expect(screen.getByLabelText('Export PDF')).toBeInTheDocument();
      expect(screen.getByLabelText('Toggle view')).toBeInTheDocument();
      expect(screen.getByLabelText('Clear all')).toBeInTheDocument();
    });

    it('hides Load and Save when not authenticated', () => {
      render(<MobileActionBar {...baseProps} isAuthenticated={false} />);
      expect(screen.queryByLabelText('Load layout')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Save layout')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Export PDF')).toBeInTheDocument();
    });

    it('shows "Saving…" label on Save button when isSaving is true', () => {
      render(<MobileActionBar {...baseProps} isSaving={true} />);
      expect(screen.getByText('Saving…')).toBeInTheDocument();
    });

    it('shows "hold: new layout" sub-label when layout has an id', () => {
      render(<MobileActionBar {...baseProps} layoutMeta={{ id: 42, name: 'x' }} />);
      expect(screen.getByText('hold: new layout')).toBeInTheDocument();
    });

    it('does not show "hold: new layout" sub-label when layout has no id', () => {
      render(<MobileActionBar {...baseProps} layoutMeta={{ id: null, name: '' }} />);
      expect(screen.queryByText('hold: new layout')).not.toBeInTheDocument();
    });

    it('shows "3D" label on view toggle when mode is perspective', () => {
      render(<MobileActionBar {...baseProps} imageViewMode={'perspective' as ImageViewMode} />);
      expect(screen.getByText('3D')).toBeInTheDocument();
    });

    it('shows "Ortho" label on view toggle when mode is ortho', () => {
      render(<MobileActionBar {...baseProps} imageViewMode={'ortho' as ImageViewMode} />);
      expect(screen.getByText('Ortho')).toBeInTheDocument();
    });
  });

  describe('disabled states', () => {
    it('disables Export when placedItems is empty', () => {
      render(<MobileActionBar {...baseProps} placedItems={[]} />);
      expect(screen.getByLabelText('Export PDF')).toBeDisabled();
    });

    it('disables Clear when placedItems and refImagePlacements are both empty', () => {
      render(<MobileActionBar {...baseProps} placedItems={[]} refImagePlacements={[]} />);
      expect(screen.getByLabelText('Clear all')).toBeDisabled();
    });

    it('enables Clear when only refImagePlacements is non-empty', () => {
      render(<MobileActionBar {...baseProps} placedItems={[]} refImagePlacements={[{ id: 'r1', refImageId: 1, name: 'img', imageUrl: '', x: 0, y: 0, width: 10, height: 10, opacity: 1, scale: 1, isLocked: false, rotation: 0 }]} />);
      expect(screen.getByLabelText('Clear all')).not.toBeDisabled();
    });

    it('disables Save when no layout id and canvas is empty', () => {
      render(<MobileActionBar {...baseProps} layoutMeta={{ id: null, name: '' }} placedItems={[]} refImagePlacements={[]} />);
      expect(screen.getByLabelText('Save layout')).toBeDisabled();
    });

    it('disables Save when isSaving is true', () => {
      render(<MobileActionBar {...baseProps} isSaving={true} />);
      expect(screen.getByLabelText('Save layout')).toBeDisabled();
    });
  });

  describe('tap actions', () => {
    it('calls onLoad when Load is tapped', () => {
      render(<MobileActionBar {...baseProps} />);
      fireEvent.click(screen.getByLabelText('Load layout'));
      expect(baseProps.onLoad).toHaveBeenCalledTimes(1);
    });

    it('calls onSave when Save is tapped (has layout id)', () => {
      render(<MobileActionBar {...baseProps} />);
      fireEvent.click(screen.getByLabelText('Save layout'));
      expect(baseProps.onSave).toHaveBeenCalledTimes(1);
    });

    it('calls onSave (opens dialog) when Save is tapped with no layout id', () => {
      render(<MobileActionBar {...baseProps} layoutMeta={{ id: null, name: '' }} />);
      fireEvent.click(screen.getByLabelText('Save layout'));
      expect(baseProps.onSave).toHaveBeenCalledTimes(1);
    });

    it('calls onExport when Export is tapped', () => {
      render(<MobileActionBar {...baseProps} />);
      fireEvent.click(screen.getByLabelText('Export PDF'));
      expect(baseProps.onExport).toHaveBeenCalledTimes(1);
    });

    it('calls onToggleView when View is tapped', () => {
      render(<MobileActionBar {...baseProps} />);
      fireEvent.click(screen.getByLabelText('Toggle view'));
      expect(baseProps.onToggleView).toHaveBeenCalledTimes(1);
    });

    it('calls onClearAll when Clear is tapped', () => {
      render(<MobileActionBar {...baseProps} />);
      fireEvent.click(screen.getByLabelText('Clear all'));
      expect(baseProps.onClearAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('long-press Save', () => {
    it('calls onSaveAsNew after 500ms hold on Save button', async () => {
      vi.useFakeTimers();
      render(<MobileActionBar {...baseProps} />);
      const saveBtn = screen.getByLabelText('Save layout');
      fireEvent.pointerDown(saveBtn);
      act(() => { vi.advanceTimersByTime(500); });
      expect(baseProps.onSaveAsNew).toHaveBeenCalledTimes(1);
      expect(baseProps.onSave).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('does not call onSaveAsNew if pointer released before 500ms', () => {
      vi.useFakeTimers();
      render(<MobileActionBar {...baseProps} />);
      const saveBtn = screen.getByLabelText('Save layout');
      fireEvent.pointerDown(saveBtn);
      act(() => { vi.advanceTimersByTime(400); });
      fireEvent.pointerUp(saveBtn);
      act(() => { vi.advanceTimersByTime(200); });
      expect(baseProps.onSaveAsNew).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
