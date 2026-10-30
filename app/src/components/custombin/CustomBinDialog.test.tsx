import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CustomBinDialog } from './CustomBinDialog';

function setup(props: Partial<React.ComponentProps<typeof CustomBinDialog>> = {}) {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  render(<CustomBinDialog open onClose={onClose} onAdd={onAdd} {...props} />);
  return { onAdd, onClose };
}

const field = (name: string) => screen.getByTestId(`param-${name}`);

function overrideNumber(name: string, label: string, value: string) {
  const el = field(name);
  fireEvent.click(within(el).getByRole('button', { name: `Override ${label}` }));
  const input = within(el).getByRole('spinbutton');
  fireEvent.change(input, { target: { value } });
  return input;
}

describe('CustomBinDialog', () => {
  it('renders nothing when closed', () => {
    render(<CustomBinDialog open={false} onClose={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves sizes in half-unit steps and shows millimetres', () => {
    setup({ initial: { width: 3, depth: 2, height: 4, overrides: {} } });
    expect(screen.getByText('126 × 84 × 28 mm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Increase width' }));
    expect(screen.getByLabelText('Width in units')).toHaveValue(3.5);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease depth' }));
    expect(screen.getByLabelText('Depth in units')).toHaveValue(1.5);
    expect(screen.getByText('147 × 63 × 28 mm')).toBeInTheDocument();
  });

  it('shows every other parameter greyed at its default', () => {
    setup();
    const lip = field('lip_style');
    expect(lip).toHaveAttribute('data-state', 'default');
    expect(within(lip).getByText('normal')).toBeInTheDocument();
    expect(field('label_style')).toHaveAttribute('data-state', 'default');
    expect(within(field('label_style')).getByText('disabled')).toBeInTheDocument();
  });

  it('lets the user override, edit and reset a parameter', () => {
    setup();
    const magnet = field('floor_thickness');
    overrideNumber('floor_thickness', 'Floor thickness (mm)', '1.2');
    expect(magnet).toHaveAttribute('data-state', 'override');
    fireEvent.click(within(magnet).getByRole('button', { name: 'Reset Floor thickness (mm)' }));
    expect(magnet).toHaveAttribute('data-state', 'default');
  });

  it('returns to greyed when the typed value equals the default after leaving the field', () => {
    setup();
    const input = overrideNumber('floor_thickness', 'Floor thickness (mm)', '1.2');
    fireEvent.change(input, { target: { value: '0.7' } });
    fireEvent.blur(input);
    expect(field('floor_thickness')).toHaveAttribute('data-state', 'default');
  });

  it('disables dependent parameters until their enabler is overridden on', () => {
    setup();
    const size = field('wallpattern_strength');
    expect(within(size).getByRole('button', { name: 'Override Strength between holes (mm)' })).toBeDisabled();
    const enabler = field('wallpattern_enabled');
    fireEvent.click(within(enabler).getByRole('button', { name: 'Override Wall pattern' }));
    fireEvent.click(within(enabler).getByRole('checkbox'));
    expect(within(size).getByRole('button', { name: 'Override Strength between holes (mm)' })).toBeEnabled();
  });

  it('badges a group with its override count', () => {
    setup();
    overrideNumber('floor_thickness', 'Floor thickness (mm)', '1.2');
    expect(screen.getByTestId('group-count-Base')).toHaveTextContent('1');
  });

  it('adds the spec with only real overrides', () => {
    const { onAdd } = setup({ initial: { width: 3, depth: 2, height: 4, overrides: {} } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to layout' }));
    expect(onAdd).toHaveBeenCalledWith({ width: 3, depth: 2, height: 4, overrides: {} });
  });

  it('adds the overrides the user chose', () => {
    const { onAdd } = setup({ initial: { width: 2.5, depth: 1.5, height: 3.5, overrides: {} } });
    overrideNumber('floor_thickness', 'Floor thickness (mm)', '1.2');
    fireEvent.click(screen.getByRole('button', { name: 'Add to layout' }));
    expect(onAdd).toHaveBeenCalledWith({ width: 2.5, depth: 1.5, height: 3.5, overrides: { floor_thickness: 1.2 } });
  });

  it('resets everything', () => {
    setup({ initial: { width: 3, depth: 2, height: 4, overrides: { floor_thickness: 1.2 } } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    expect(screen.getByTestId('overrides-summary')).toHaveTextContent('No overrides');
  });

  it('closes on cancel and Escape', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
