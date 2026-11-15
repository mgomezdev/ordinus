import { it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GuestBinImage } from './GuestDrawer';
it('reloads a bin image and clears an old image failure when the shared revision changes', () => {
  const bin = { id: 1, name: 'Tray', x: 0, y: 0, width: 2, depth: 2, rotation: 0, heightUnits: 4 };
  const model = { id: 1, topUrl: '/guest/bin/top', perspectiveUrl: '/guest/bin/perspective', topRotation: 0, status: 'ready' as const };
  const { rerender } = render(<GuestBinImage bin={bin} model={model} view="top" version={1} />);
  expect(screen.getByRole('img')).toHaveAttribute('src', '/guest/bin/top?v=1');
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByText('Top preview unavailable')).toBeTruthy();
  rerender(<GuestBinImage bin={bin} model={model} view="top" version={2} />);
  expect(screen.getByRole('img')).toHaveAttribute('src', '/guest/bin/top?v=2');
});
