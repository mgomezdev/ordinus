import { useEffect, useRef } from 'react';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { category: 'Items', shortcuts: [
    { keys: ['R'], description: 'Rotate selected clockwise' },
    { keys: ['Shift', 'R'], description: 'Rotate selected counter-clockwise' },
    { keys: ['Delete'], description: 'Delete selected items' },
    { keys: ['Ctrl', 'D'], description: 'Duplicate selected items' },
    { keys: ['Ctrl', 'C'], description: 'Copy selected items' },
    { keys: ['Ctrl', 'V'], description: 'Paste copied items' },
    { keys: ['Ctrl', 'A'], description: 'Select all items' },
    { keys: ['Escape'], description: 'Deselect all' },
  ]},
  { category: 'View', shortcuts: [
    { keys: ['V'], description: 'Toggle top/3D image view' },
    { keys: ['+'], description: 'Zoom in' },
    { keys: ['-'], description: 'Zoom out' },
    { keys: ['Ctrl', '0'], description: 'Reset zoom' },
    { keys: ['Space + Drag'], description: 'Pan view' },
    { keys: ['Scroll'], description: 'Zoom at cursor' },
    { keys: ['Middle Click + Drag'], description: 'Pan view' },
  ]},
  { category: 'Reference Images', shortcuts: [
    { keys: ['L'], description: 'Toggle lock on selected image' },
    { keys: ['R'], description: 'Rotate selected image clockwise' },
    { keys: ['Shift', 'R'], description: 'Rotate selected image counter-clockwise' },
    { keys: ['Delete'], description: 'Remove selected image' },
  ]},
  { category: 'General', shortcuts: [
    { keys: ['?'], description: 'Show this help' },
  ]},
];

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      dialogRef.current?.focus();
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      // Focus trap
      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="keyboard-shortcuts-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="keyboard-shortcuts-dialog"
        role="dialog"
        aria-label="Keyboard shortcuts"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-shortcuts-header">
          <h2>Keyboard Shortcuts</h2>
          <button
            className="keyboard-shortcuts-close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="keyboard-shortcuts-body">
          {SHORTCUTS.map(({ category, shortcuts }) => (
            <div key={category} className="keyboard-shortcuts-section">
              <h3>{category}</h3>
              <dl className="keyboard-shortcuts-list">
                {shortcuts.map(({ keys, description }) => (
                  <div key={description} className="keyboard-shortcut-row">
                    <dt className="keyboard-shortcut-keys">
                      {keys.map((key, i) => (
                        <span key={i}>
                          {i > 0 && <span className="keyboard-shortcut-separator">+</span>}
                          <kbd>{key}</kbd>
                        </span>
                      ))}
                    </dt>
                    <dd className="keyboard-shortcut-description">{description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
