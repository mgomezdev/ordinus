import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { LibraryItem } from '../types/gridfinity';

interface ItemPreviewPopoverProps {
  item: LibraryItem;
  anchorRect: DOMRect;
}

function getPosition(anchorRect: DOMRect): { left: number; top: number } {
  const POPOVER_WIDTH = 212; // 180px image + 2 * 16px padding
  const GAP = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // On narrow screens, center above the anchor
  if (viewportWidth < 480) {
    return {
      left: Math.max(
        GAP,
        Math.min(
          anchorRect.left + anchorRect.width / 2 - POPOVER_WIDTH / 2,
          viewportWidth - POPOVER_WIDTH - GAP,
        ),
      ),
      top: Math.max(GAP, anchorRect.top - 240 - GAP),
    };
  }

  // Default: to the right of the anchor
  let left = anchorRect.right + GAP;
  const top = Math.max(
    GAP,
    Math.min(anchorRect.top, viewportHeight - 260),
  );

  // Flip left if near right edge
  if (left + POPOVER_WIDTH > viewportWidth - GAP) {
    left = anchorRect.left - POPOVER_WIDTH - GAP;
  }

  return { left: Math.max(GAP, left), top };
}

export function ItemPreviewPopover({ item, anchorRect }: ItemPreviewPopoverProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger fade-in on next frame
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const imageSrc = item.perspectiveImageUrl || item.imageUrl;
  const pos = getPosition(anchorRect);

  return createPortal(
    <div
      className={`item-preview-popover ${visible ? 'visible' : ''}`}
      style={{ left: pos.left, top: pos.top }}
    >
      {imageSrc && (
        <img
          className="item-preview-popover-image"
          src={imageSrc}
          alt={item.name}
        />
      )}
      <div className="item-preview-popover-name">{item.name}</div>
      <div className="item-preview-popover-size">
        {item.widthUnits}x{item.heightUnits}
      </div>
    </div>,
    document.body,
  );
}
