import type { ComputedSpacer } from '../types/gridfinity';

interface SpacerOverlayProps {
  spacer: ComputedSpacer;
}

export function SpacerOverlay({ spacer }: SpacerOverlayProps) {
  return (
    <div
      className="spacer-overlay"
      style={{
        left: `${spacer.renderX}%`,
        top: `${spacer.renderY}%`,
        width: `${spacer.renderWidth}%`,
        height: `${spacer.renderHeight}%`,
      }}
      data-position={spacer.position}
    />
  );
}
