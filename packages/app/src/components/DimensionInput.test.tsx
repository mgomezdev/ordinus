import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DimensionInput } from './DimensionInput';

function renderMetric(onChange = vi.fn()) {
  return { onChange, ...render(
    <DimensionInput label="Width" value={168} onChange={onChange} unit="metric" imperialFormat="decimal" />
  )};
}

function renderDecimalImperial(value = 6.6142, onChange = vi.fn()) {
  return { onChange, ...render(
    <DimensionInput label="Width" value={value} onChange={onChange} unit="imperial" imperialFormat="decimal" />
  )};
}

function renderFractional(value = 10.75, onChange = vi.fn()) {
  return { onChange, ...render(
    <DimensionInput label="Width" value={value} onChange={onChange} unit="imperial" imperialFormat="fractional" />
  )};
}

describe('Metric mode', () => {
  it('renders a number input with the value', () => {
    renderMetric();
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue(168);
  });

  it('shows mm unit label', () => {
    renderMetric();
    expect(screen.getByText('mm')).toBeInTheDocument();
  });

  it('calls onChange with parsed float on input change', () => {
    const { onChange } = renderMetric();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '200' } });
    expect(onChange).toHaveBeenCalledWith(200);
  });

  it('falls back to 0 for non-numeric input', () => {
    const { onChange } = renderMetric();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith(0);
  });
});

describe('Imperial decimal mode', () => {
  it('renders a number input with the current value', () => {
    renderDecimalImperial(6.5);
    expect(screen.getByRole('spinbutton')).toHaveValue(6.5);
  });

  it('shows in unit label', () => {
    renderDecimalImperial();
    expect(screen.getByText('in')).toBeInTheDocument();
  });
});

describe('Imperial fractional mode', () => {
  it('renders a text input showing fractional display value', () => {
    renderFractional(10.75);
    // 10.75 → "10 3/4"
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('10 3/4');
  });

  it('calls onChange while typing a valid fraction', () => {
    const { onChange } = renderFractional(0);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '6 1/2' } });
    expect(onChange).toHaveBeenCalledWith(6.5);
  });

  it('calls onChange with 0 for unparseable input', () => {
    // Use value=5 so fractionToDecimal('xyz')=0 !== 5 passes the guard and onChange fires
    const { onChange } = renderFractional(5);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'xyz' } });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('shows the editValue while focused instead of displayValue', () => {
    renderFractional(10.75);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    // After focus, editValue is set to displayValue
    expect(input).toHaveValue('10 3/4');
    // Type something new
    fireEvent.change(input, { target: { value: '11' } });
    expect(input).toHaveValue('11');
  });

  it('calls onChange on blur after editing', () => {
    const { onChange } = renderFractional(10.75);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '11' } });
    fireEvent.blur(input);
    // fractionToDecimal('11') = 11, 11 !== 10.75 → onChange fires
    expect(onChange).toHaveBeenCalledWith(11);
  });
});
