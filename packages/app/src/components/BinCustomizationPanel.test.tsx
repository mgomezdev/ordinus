import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BinCustomizationPanel } from './BinCustomizationPanel';
import type { BinCustomization, CustomizableFieldDef } from '../types/gridfinity';
import { DEFAULT_BIN_CUSTOMIZATION } from '../types/gridfinity';

const ALL_FIELDS: CustomizableFieldDef[] = [
  { field: 'wallPatternEnabled', label: 'Wall Pattern' },
  { field: 'wallPattern', label: 'Wall Pattern', options: ['grid', 'hexgrid', 'brick'] },
  { field: 'lipStyle',    label: 'Lip Style',    options: ['normal', 'reduced', 'minimum', 'none'] },
  { field: 'fingerSlide', label: 'Finger Slide', options: ['none', 'rounded', 'chamfered'] },
  { field: 'wallCutout',  label: 'Wall Cutout' },
  { field: 'height',      label: 'Height',       min: 1, max: 20 },
];
const SHADOWBOX_FIELDS: CustomizableFieldDef[] = [
  { field: 'lipStyle',    label: 'Lip Style',    options: ['normal', 'reduced', 'minimum', 'none'] },
  { field: 'fingerSlide', label: 'Finger Slide', options: ['none', 'rounded', 'chamfered'] },
  { field: 'wallCutout',  label: 'Wall Cutout' },
  { field: 'height',      label: 'Height',       min: 1, max: 20 },
];

describe('BinCustomizationPanel', () => {
  const mockOnChange = vi.fn();
  const mockOnReset = vi.fn();

  const nonDefaultCustomization: BinCustomization = {
    wallPatternEnabled: true,
    wallPattern: 'grid',
    lipStyle: 'reduced',
    fingerSlide: 'rounded',
    wallCutout: { front: true, back: false, left: false, right: false },
    height: 8,
  };

  beforeEach(() => {
    mockOnChange.mockClear();
    mockOnReset.mockClear();
  });

  describe('Rendering', () => {
    it('should render all four customization controls', () => {
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
      // wallCutout now renders checkboxes; verify the label text is present
      expect(screen.getByText(/wall cutout/i)).toBeInTheDocument();
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
    it('should display current wallPattern value in the style select when enabled', () => {
      render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallPatternStyleSelect = screen.getByLabelText('Style') as HTMLSelectElement;
      expect(wallPatternStyleSelect.value).toBe('grid');
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
  });

  describe('Default values when customization is undefined', () => {
    it('should show wall pattern toggle unchecked when customization is undefined (default disabled)', () => {
      render(
        <BinCustomizationPanel
          customization={undefined}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallPatternToggle = screen.getByLabelText(/wall pattern/i) as HTMLInputElement;
      expect(wallPatternToggle.checked).toBe(DEFAULT_BIN_CUSTOMIZATION.wallPatternEnabled);
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

    it('should show all wall cutout checkboxes unchecked when customization is undefined (default all false)', () => {
      render(
        <BinCustomizationPanel
          customization={undefined}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.getByRole('checkbox', { name: /front/i })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: /back/i })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: /left/i })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: /right/i })).not.toBeChecked();
    });
  });

  describe('onChange callbacks', () => {
    it('should call onChange with wallPatternEnabled: true when wall pattern toggle is checked', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallPatternToggle = screen.getByLabelText(/wall pattern/i);
      fireEvent.click(wallPatternToggle);

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({ wallPatternEnabled: true })
      );
    });

    it('should call onChange with updated wallPattern when style select changes', () => {
      render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallPatternStyleSelect = screen.getByLabelText('Style');
      fireEvent.change(wallPatternStyleSelect, { target: { value: 'hexgrid' } });

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

    it('should preserve other customization fields when changing wallPattern style', () => {
      render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallPatternStyleSelect = screen.getByLabelText('Style');
      fireEvent.change(wallPatternStyleSelect, { target: { value: 'brick' } });

      expect(mockOnChange).toHaveBeenCalledWith({
        wallPatternEnabled: true,
        wallPattern: 'brick',
        lipStyle: 'reduced',
        fingerSlide: 'rounded',
        wallCutout: { front: true, back: false, left: false, right: false },
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
        wallPatternEnabled: true,
        wallPattern: 'grid',
        lipStyle: 'none',
        fingerSlide: 'rounded',
        wallCutout: { front: true, back: false, left: false, right: false },
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

    it('should enable reset button when wallPatternEnabled differs from default', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, wallPatternEnabled: true }}
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
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, wallCutout: { front: true, back: false, left: false, right: false } }}
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

  describe('Wall pattern controls', () => {
    it('should show style select with 3 options (grid, hexgrid, brick) when enabled', () => {
      render(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      const wallPatternStyleSelect = screen.getByLabelText('Style');
      const options = Array.from((wallPatternStyleSelect as HTMLSelectElement).options).map(
        (opt) => opt.value
      );

      expect(options).toContain('grid');
      expect(options).toContain('hexgrid');
      expect(options).toContain('brick');
      expect(options).not.toContain('none');
      expect(options).toHaveLength(3);
    });

    it('should not show style select when wall pattern is disabled', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(screen.queryByLabelText('Style')).not.toBeInTheDocument();
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

  describe('wallCutout checkboxes', () => {
    const wallCutoutField: CustomizableFieldDef = { field: 'wallCutout', label: 'Wall Cutout' };
    const baseCustomization: BinCustomization = {
      ...DEFAULT_BIN_CUSTOMIZATION,
      wallCutout: { front: false, back: false, left: false, right: false },
    };

    it('renders 4 checkboxes when wallCutout field is present', () => {
      render(
        <BinCustomizationPanel
          customization={baseCustomization}
          customizableFields={[wallCutoutField]}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />
      );
      expect(screen.getByRole('checkbox', { name: /front/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /back/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /left/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /right/i })).toBeInTheDocument();
    });

    it('reflects checked state from customization', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...baseCustomization, wallCutout: { front: true, back: false, left: false, right: false } }}
          customizableFields={[wallCutoutField]}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />
      );
      expect(screen.getByRole('checkbox', { name: /front/i })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /back/i })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: /left/i })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: /right/i })).not.toBeChecked();
    });

    it('calls onChange with updated wallCutout when front checkbox toggled', async () => {
      const onChange = vi.fn();
      render(
        <BinCustomizationPanel
          customization={baseCustomization}
          customizableFields={[wallCutoutField]}
          onChange={onChange}
          onReset={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('checkbox', { name: /front/i }));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          wallCutout: expect.objectContaining({ front: true, back: false, left: false, right: false })
        })
      );
    });

    it('calls onChange with updated wallCutout when back checkbox toggled', async () => {
      const onChange = vi.fn();
      render(
        <BinCustomizationPanel
          customization={baseCustomization}
          customizableFields={[wallCutoutField]}
          onChange={onChange}
          onReset={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('checkbox', { name: /back/i }));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          wallCutout: expect.objectContaining({ front: false, back: true, left: false, right: false })
        })
      );
    });

    it('unchecks a wall when toggled from true to false', async () => {
      const onChange = vi.fn();
      render(
        <BinCustomizationPanel
          customization={{ ...baseCustomization, wallCutout: { front: true, back: true, left: false, right: false } }}
          customizableFields={[wallCutoutField]}
          onChange={onChange}
          onReset={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('checkbox', { name: /front/i }));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          wallCutout: expect.objectContaining({ front: false, back: true, left: false, right: false })
        })
      );
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

      const wallPatternToggle = screen.getByLabelText(/wall pattern/i) as HTMLInputElement;
      expect(wallPatternToggle.checked).toBe(false);
      expect(screen.queryByLabelText('Style')).not.toBeInTheDocument();

      rerender(
        <BinCustomizationPanel
          customization={nonDefaultCustomization}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={ALL_FIELDS}
        />
      );

      expect(wallPatternToggle.checked).toBe(true);
      expect((screen.getByLabelText('Style') as HTMLSelectElement).value).toBe('grid');
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
    it('renders stepper input and mm display', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      expect(screen.getByLabelText('Height in units')).toBeInTheDocument();
      expect(screen.getByText('28 mm')).toBeInTheDocument();
    });

    it('input shows current height and mm display reflects it', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, height: 3 }}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      expect(screen.getByLabelText('Height in units')).toHaveValue(3);
      expect(screen.getByText('21 mm')).toBeInTheDocument();
    });

    it('− button decrements height', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, height: 4 }}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      fireEvent.click(screen.getByLabelText('Decrease height'));
      expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ height: 3 }));
    });

    it('+ button increments height', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, height: 4 }}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      fireEvent.click(screen.getByLabelText('Increase height'));
      expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ height: 5 }));
    });

    it('− button disabled at min', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, height: 1 }}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      expect(screen.getByLabelText('Decrease height')).toBeDisabled();
    });

    it('+ button disabled at max', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, height: 20 }}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      expect(screen.getByLabelText('Increase height')).toBeDisabled();
    });

    it('typing a value and blurring calls onChange with clamped integer', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      fireEvent.change(screen.getByLabelText('Height in units'), { target: { value: '8' } });
      fireEvent.blur(screen.getByLabelText('Height in units'));
      expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ height: 8 }));
    });

    it('value above max is clamped on blur', () => {
      render(
        <BinCustomizationPanel
          customization={DEFAULT_BIN_CUSTOMIZATION}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      fireEvent.change(screen.getByLabelText('Height in units'), { target: { value: '99' } });
      fireEvent.blur(screen.getByLabelText('Height in units'));
      expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ height: 20 }));
    });

    it('non-numeric input reverts to current height on blur', () => {
      render(
        <BinCustomizationPanel
          customization={{ ...DEFAULT_BIN_CUSTOMIZATION, height: 4 }}
          onChange={mockOnChange}
          onReset={mockOnReset}
          customizableFields={[{ field: 'height', label: 'Height', min: 1, max: 20 }]}
        />
      );
      fireEvent.change(screen.getByLabelText('Height in units'), { target: { value: 'abc' } });
      fireEvent.blur(screen.getByLabelText('Height in units'));
      expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ height: 4 }));
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
