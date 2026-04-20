import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './BinContextMenu.css';

interface BinContextMenuProps {
  x: number;
  y: number;
  onRotateCw: () => void;
  onRotateCcw: () => void;
  onDuplicate: () => void;
  onCustomize?: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function BinContextMenu({
  x,
  y,
  onRotateCw,
  onRotateCcw,
  onDuplicate,
  onCustomize,
  onDelete,
  onClose,
}: BinContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position to stay within viewport by directly mutating the DOM style,
  // avoiding a setState → re-render cascade.
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const { width, height } = menuRef.current.getBoundingClientRect();
    const adjustedX = x + width > window.innerWidth ? x - width : x;
    const adjustedY = y + height > window.innerHeight ? y - height : y;
    menuRef.current.style.left = `${Math.max(0, adjustedX)}px`;
    menuRef.current.style.top = `${Math.max(0, adjustedY)}px`;
  }, [x, y]);

  // Dismiss on outside mousedown
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);

  // Dismiss on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const menu = (
    <div
      ref={menuRef}
      className="bin-context-menu"
      role="menu"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        className="bin-context-menu-item"
        role="menuitem"
        aria-label="Rotate counter-clockwise"
        onClick={() => handleAction(onRotateCcw)}
      >
        <span className="bin-context-menu-icon">&#8634;</span>
        <span className="bin-context-menu-label">Rotate CCW</span>
        <span className="bin-context-menu-hint">Shift+R</span>
      </button>
      <button
        className="bin-context-menu-item"
        role="menuitem"
        aria-label="Rotate clockwise"
        onClick={() => handleAction(onRotateCw)}
      >
        <span className="bin-context-menu-icon">&#8635;</span>
        <span className="bin-context-menu-label">Rotate CW</span>
        <span className="bin-context-menu-hint">R</span>
      </button>
      <div className="bin-context-menu-divider" />
      <button
        className="bin-context-menu-item"
        role="menuitem"
        aria-label="Duplicate"
        onClick={() => handleAction(onDuplicate)}
      >
        <span className="bin-context-menu-icon">&#x29C9;</span>
        <span className="bin-context-menu-label">Duplicate</span>
        <span className="bin-context-menu-hint">Ctrl+D</span>
      </button>
      {onCustomize && (
        <>
          <div className="bin-context-menu-divider" />
          <button
            className="bin-context-menu-item"
            role="menuitem"
            aria-label="Customize"
            onClick={() => handleAction(onCustomize)}
          >
            <span className="bin-context-menu-icon">&#9881;</span>
            <span className="bin-context-menu-label">Customize…</span>
          </button>
        </>
      )}
      <div className="bin-context-menu-divider" />
      <button
        className="bin-context-menu-item bin-context-menu-item--danger"
        role="menuitem"
        aria-label="Delete"
        onClick={() => handleAction(onDelete)}
      >
        <span className="bin-context-menu-icon">&times;</span>
        <span className="bin-context-menu-label">Delete</span>
        <span className="bin-context-menu-hint">Del</span>
      </button>
    </div>
  );

  return createPortal(menu, document.body);
}
