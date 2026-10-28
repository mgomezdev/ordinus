import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GridSummary } from './GridSummary';
import type { GridSpacerConfig } from '../types/gridfinity';

const NONE: GridSpacerConfig = { horizontal: 'none', vertical: 'none' };

describe('GridSummary', () => {
  it('shows placeholder for empty grid', () => {
    render(
      <GridSummary gridX={0} gridY={0} gapWidth={0} gapDepth={0}
        spacerConfig={NONE} unit="metric" imperialFormat="decimal" />
    );
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('shows single gap value when spacers are none', () => {
    render(
      <GridSummary gridX={2} gridY={3} gapWidth={10} gapDepth={10}
        spacerConfig={NONE} unit="metric" imperialFormat="decimal" />
    );
    expect(screen.getByText('Gap: 10.0 mm')).toBeInTheDocument();
  });

  it('shows full gap for one-sided spacers', () => {
    render(
      <GridSummary gridX={2} gridY={3} gapWidth={10} gapDepth={6}
        spacerConfig={{ horizontal: 'one-sided', vertical: 'one-sided' }}
        unit="metric" imperialFormat="decimal" />
    );
    expect(screen.getByText('Gap: 10.0 x 6.0 mm')).toBeInTheDocument();
  });

  it('splits gap in half for symmetrical spacers', () => {
    render(
      <GridSummary gridX={2} gridY={3} gapWidth={10} gapDepth={6}
        spacerConfig={{ horizontal: 'symmetrical', vertical: 'symmetrical' }}
        unit="metric" imperialFormat="decimal" />
    );
    expect(screen.getByText('Gap: 5.0 + 5.0 x 3.0 + 3.0 mm')).toBeInTheDocument();
  });

  it('uses woodworking fractions for imperial fractional', () => {
    render(
      <GridSummary gridX={2} gridY={3} gapWidth={0.5} gapDepth={0.5}
        spacerConfig={{ horizontal: 'symmetrical', vertical: 'symmetrical' }}
        unit="imperial" imperialFormat="fractional" />
    );
    expect(screen.getByText('Gap: 1/4 + 1/4 in')).toBeInTheDocument();
  });
});
