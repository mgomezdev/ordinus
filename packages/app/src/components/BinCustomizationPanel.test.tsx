import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BinCustomizationPanel } from './BinCustomizationPanel';
import type { BinCustomization, CustomizableFieldDef } from '../types/gridfinity';
import { DEFAULT_BIN_CUSTOMIZATION } from '../types/gridfinity';

const ALL_FIELDS: CustomizableFieldDef[] = [
  { field: 'wallPattern', label: 'Wall Pattern', options: ['none', 'grid', 'hexgrid', 'brick'] },
  { field: 'lipStyle',    label: 'Lip Style',    options: ['normal', 'reduced', 'minimum', 'none'] },
  { field: 'fingerSlide', label: 'Finger Slide', options: ['none', 'rounded', 'chamfered'] },
  { field: 'wallCutout',  label: 'Wall Cutout',  options: ['none', 'vertical', 'horizontal', 'both'] },
  { field: 'height',      label: 'Height',       min: 1, max: 20 },
];
const SHADOWBOX_FIELDS: CustomizableFieldDef[] = [
  { field: 'lipStyle',    label: 'Lip Style',    options: ['normal', 'reduced', 'minimum', 'none'] },
  { field: 'fingerSlide', label: 'Finger Slide', options: ['none', 'rounded', 'chamfered'] },
  { field: 'wallCutout',  label: 'Wall Cutout',  options: ['none', 'vertical', 'horizontal', 'both'] },
  { field: 'height',      label: 'Height',       min: 1, max: 20 },
];

describe('BinCustomizationPanel', () => {
  const mockOnChange = vi.fn();
  const mockOnReset = vi.fn();

  const nonDefaultCustomization: BinCustomization = {
    wallPattern: 'grid',
    lipStyle: 'reduced',
    fingerSlide: 'rounded',
    wallCutout: 'vertical',
    height: 8,
  };

  beforeEach(() => {
    mockOnChange.mockClear();
    mockOnReset.mockClear();
  });

  describe('Rendering', () => {
    it('should render all four customization selects', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByLabelText(/wall pattern/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/lip style/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/finger slide/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/wall cutout/i)).toBeInTheDocument();
    });

    it('should render a reset button', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
    });
  });

  describe('Displaying current customization values', () => {
    it('should display current wallPattern value in the select', () => {
      render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallPatternSelect = screen.getByLabelText(/wall pattern/i) as HTMLSelectElement;
      expect(wallPatternSelect.value).toBe('grid');
    });

    it('should display current lipStyle value in the select', () => {
      render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const lipStyleSelect = screen.getByLabelText(/lip style/i) as HTMLSelectElement;
      expect(lipStyleSelect.value).toBe('reduced');
    });

    it('should display current fingerSlide value in the select', () => {
      render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const fingerSlideSelect = screen.getByLabelText(/finger slide/i) as HTMLSelectElement;
      expect(fingerSlideSelect.value).toBe('rounded');
    });

    it('should display current wallCutout value in the select', () => {
      render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallCutoutSelect = screen.getByLabelText(/wall cutout/i) as HTMLSelectElement;
      expect(wallCutoutSelect.value).toBe('vertical');
    });
  });

  describe('Default values when customization is undefined', () => {
    it('should show default wallPattern when customization is undefined', () => {
      render(
        <BinCustomizationPanel
          customization={undefined}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallPatternSelect = screen.getByLabelText(/wall pattern/i) as HTMLSelectElement;
      expect(wallPatternSelect.value).toBe(DEFAULT_BIN_CUSTOMIZATION.wallPattern);
    });

    it('should show default lipStyle when customization is undefined', () => {
      render(
        <BinCustomizationPanel
          customization={undefined}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const lipStyleSelect = screen.getByLabelText(/lip style/i) as HTMLSelectElement;
      expect(lipStyleSelect.value).toBe(DEFAULT_BIN_CUSTOMIZATION.lipStyle);
    });

    it('should show default fingerSlide when customization is undefined', () => {
      render(
        <BinCustomizationPanel
          customization={undefined}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const fingerSlideSelect = screen.getByLabelText(/finger slide/i) as HTMLSelectElement;
      expect(fingerSlideSelect.value).toBe(DEFAULT_BIN_CUSTOMIZATION.fingerSlide);
    });

    it('should show default wallCutout when customization is undefined', () => {
      render(
        <BinCustomizationPanel
          customization={undefined}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallCutoutSelect = screen.getByLabelText(/wall cutout/i) as HTMLSelectElement;
      expect(wallCutoutSelect.value).toBe(DEFAULT_BIN_CUSTOMIZATION.wallCutout);
    });
  });

  describe('onChange callbacks', () => {
    it('should call onChange with updated wallPattern when wall pattern select changes', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallPatternSelect = screen.getByLabelText(/wall pattern/i);
      fireEvent.change(wallPatternSelect, { target: { value: 'hexgrid' } });

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({ wallPattern: 'hexgrid' })
      );
    });

    it('should call onChange with updated lipStyle when lip style select changes', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const lipStyleSelect = screen.getByLabelText(/lip style/i);
      fireEvent.change(lipStyleSelect, { target: { value: 'minimum' } });

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({ lipStyle: 'minimum' })
      );
    });

    it('should call onChange with updated fingerSlide when finger slide select changes', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const fingerSlideSelect = screen.getByLabelText(/finger slide/i);
      fireEvent.change(fingerSlideSelect, { target: { value: 'chamfered' } });

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({ fingerSlide: 'chamfered' })
      );
    });

    it('should call onChange with updated wallCutout when wall cutout select changes', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallCutoutSelect = screen.getByLabelText(/wall cutout/i);
      fireEvent.change(wallCutoutSelect, { target: { value: 'both' } });

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({ wallCutout: 'both' })
      );
    });

    it('should preserve other customization fields when changing wallPattern', () => {
      render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallPatternSelect = screen.getByLabelText(/wall pattern/i);
      fireEvent.change(wallPatternSelect, { target: { value: 'brick' } });

      expect(mockOnChange).toHaveBeenCalledWith({
        wallPattern: 'brick',
        lipStyle: 'reduced',
        fingerSlide: 'rounded',
        wallCutout: 'vertical',
        height: 8,
      });
    });

    it('should preserve other customization fields when changing lipStyle', () => {
      render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const lipStyleSelect = screen.getByLabelText(/lip style/i);
      fireEvent.change(lipStyleSelect, { target: { value: 'none' } });

      expect(mockOnChange).toHaveBeenCalledWith({
        wallPattern: 'grid',
        lipStyle: 'none',
        fingerSlide: 'rounded',
        wallCutout: 'vertical',
        height: 8,
      });
    });
  });

  describe('onReset callback', () => {
    it('should call onReset when reset button is clicked', () => {
      render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const resetButton = screen.getByRole('button', { name: /reset/i });
      fireEvent.click(resetButton);

      expect(mockOnReset).toHaveBeenCalledTimes(1);
    });

    it('should not call onChange when reset button is clicked', () => {
      render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const resetButton = screen.getByRole('button', { name: /reset/i });
      fireEvent.click(resetButton);

      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('Reset button disabled state', () => {
    it('should disable reset button when customization is undefined', () => {
      render(
        <BinCustomizationPanel
          customization={undefined}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();
    });

    it('should disable reset button when customization matches default values', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();
    });

    it('should enable reset button when customization differs from defaults', () => {
      render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();
    });

    it('should enable reset button when only wallPattern differs from default', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, wallPattern: 'grid' }}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();
    });

    it('should enable reset button when only lipStyle differs from default', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, lipStyle: 'none' }}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();
    });

    it('should enable reset button when only fingerSlide differs from default', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, fingerSlide: 'chamfered' }}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();
    });

    it('should enable reset button when only wallCutout differs from default', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, wallCutout: 'horizontal' }}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();
    });

    it('should not call onReset when disabled reset button is clicked', () => {
      render(
        <BinCustomizationPanel
          customization={undefined}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const resetButton = screen.getByRole('button', { name: /reset/i });
      fireEvent.click(resetButton);

      expect(mockOnReset).not.toHaveBeenCalled();
    });
  });

  describe('Wall pattern select options', () => {
    it('should have all 4 wall pattern options (none, grid, hexgrid, brick)', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallPatternSelect = screen.getByLabelText(/wall pattern/i);
      const options = Array.from((wallPatternSelect as HTMLSelectElement).options).map(
        (opt) => opt.value
      );

      expect(options).toContain('none');
      expect(options).toContain('grid');
      expect(options).toContain('hexgrid');
      expect(options).toContain('brick');
    });

    it('should have exactly 4 wall pattern options', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallPatternSelect = screen.getByLabelText(/wall pattern/i);
      const options = (wallPatternSelect as HTMLSelectElement).options;

      expect(options).toHaveLength(4);
    });
  });

  describe('Lip style select options', () => {
    it('should have all 4 lip style options (normal, reduced, minimum, none)', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const lipStyleSelect = screen.getByLabelText(/lip style/i);
      const options = Array.from((lipStyleSelect as HTMLSelectElement).options).map(
        (opt) => opt.value
      );

      expect(options).toContain('normal');
      expect(options).toContain('reduced');
      expect(options).toContain('minimum');
      expect(options).toContain('none');
    });
  });

  describe('Finger slide select options', () => {
    it('should have all 3 finger slide options (none, rounded, chamfered)', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const fingerSlideSelect = screen.getByLabelText(/finger slide/i);
      const options = Array.from((fingerSlideSelect as HTMLSelectElement).options).map(
        (opt) => opt.value
      );

      expect(options).toContain('none');
      expect(options).toContain('rounded');
      expect(options).toContain('chamfered');
    });
  });

  describe('Wall cutout select options', () => {
    it('should have all 4 wall cutout options (none, vertical, horizontal, both)', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallCutoutSelect = screen.getByLabelText(/wall cutout/i);
      const options = Array.from((wallCutoutSelect as HTMLSelectElement).options).map(
        (opt) => opt.value
      );

      expect(options).toContain('none');
      expect(options).toContain('vertical');
      expect(options).toContain('horizontal');
      expect(options).toContain('both');
    });
  });

  describe('Props updates (rerender)', () => {
    it('should update displayed values when customization prop changes', () => {
      const { rerender } = render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallPatternSelect = screen.getByLabelText(/wall pattern/i) as HTMLSelectElement;
      expect(wallPatternSelect.value).toBe('none');

      rerender(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(wallPatternSelect.value).toBe('grid');
    });

    it('should update reset button disabled state when customization prop changes to default', () => {
      const { rerender } = render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();

      rerender(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();
    });

    it('should update reset button disabled state when customization prop changes from default to non-default', () => {
      const { rerender } = render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();

      rerender(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();
    });
  });

  describe('customizableFields prop', () => {
    it('renders only fields listed in customizableFields', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={SHADOWBOX_FIELDS}
        />
      );
      expect(screen.queryByLabelText(/wall pattern/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/lip style/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Height in units')).toBeInTheDocument();
    });

    it('renders nothing when customizableFields is empty', () => {
      const { container } = render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[]}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders all fields when all are listed', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );
      expect(screen.getByLabelText(/wall pattern/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Height in units')).toBeInTheDocument();
    });
  });

  describe('height field', () => {
    it('renders unit and mm inputs', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      expect(screen.getByLabelText('Height in units')).toBeInTheDocument();
      expect(screen.getByLabelText('Height in millimeters')).toBeInTheDocument();
    });

    it('unit input shows current height, mm input shows height * 7', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, height: 3 }}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      expect(screen.getByLabelText('Height in units')).toHaveValue(3);
      expect(screen.getByLabelText('Height in millimeters')).toHaveValue(21);
    });

    it('changing unit input calls onChange with new height', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      fireEvent.change(screen.getByLabelText('Height in units'), { target: { value: '5' } });
      expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ height: 5 }));
    });

    it('blurring mm input with aligned value calls onChange with correct units', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      fireEvent.change(screen.getByLabelText('Height in millimeters'), { target: { value: '35' } });
      fireEvent.blur(screen.getByLabelText('Height in millimeters'));
      expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ height: 5 }));
    });

    it('blurring mm input with unaligned value rounds down and shows correction message', async () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      fireEvent.change(screen.getByLabelText('Height in millimeters'), { target: { value: '23' } });
      fireEvent.blur(screen.getByLabelText('Height in millimeters'));
      expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ height: 3 }));
      expect(await screen.findByText(/rounded to 3u \(21mm\)/i)).toBeInTheDocument();
    });

    it('correction message disappears after 2 seconds', async () => {
      vi.useFakeTimers();
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      fireEvent.change(screen.getByLabelText('Height in millimeters'), { target: { value: '23' } });
      fireEvent.blur(screen.getByLabelText('Height in millimeters'));
      expect(screen.getByText(/rounded to 3u \(21mm\)/i)).toBeInTheDocument();
      await act(async () => { vi.advanceTimersByTime(2001); });
      expect(screen.queryByText(/rounded to 3u \(21mm\)/i)).not.toBeInTheDocument();
      vi.useRealTimers();
    });
  });

  describe('customizationDefaults for reset', () => {
    it('calls onReset when reset button clicked', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, height: 6 }}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
          parameters={{ height: 4 }}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /reset/i }));
      expect(mockOnReset).toHaveBeenCalled();
    });
  });
});
