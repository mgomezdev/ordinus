import type { ReactNode, CSSProperties, MouseEventHandler, Ref } from 'react';
interface Props {
  onRotateCcw?: MouseEventHandler<HTMLButtonElement>; onRotateCw?: MouseEventHandler<HTMLButtonElement>;
  onDuplicate?: MouseEventHandler<HTMLButtonElement>; onCustomize?: MouseEventHandler<HTMLButtonElement>; onDelete?: MouseEventHandler<HTMLButtonElement>;
  customizeRef?: Ref<HTMLButtonElement>; favorite?: ReactNode; disabled?: boolean; style?: CSSProperties;
}
export function BinPlacementToolbar({ onRotateCcw, onRotateCw, onDuplicate, onCustomize, onDelete, customizeRef, favorite, disabled, style }: Props) {
  return <div className="placed-item-toolbar" role="toolbar" aria-label="Selected bin actions" style={style} onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    {favorite}
    {onRotateCcw && <button type="button" draggable={false} className="placed-item-toolbar-btn" disabled={disabled} onClick={onRotateCcw} aria-label="Rotate counter-clockwise" title="Rotate counter-clockwise (Shift+R)">↺</button>}
    {onRotateCw && <button type="button" draggable={false} className="placed-item-toolbar-btn" disabled={disabled} onClick={onRotateCw} aria-label="Rotate clockwise" title="Rotate clockwise (R)">↻</button>}
    {onDuplicate && <button type="button" draggable={false} className="placed-item-toolbar-btn" disabled={disabled} onClick={onDuplicate} aria-label="Duplicate" title="Duplicate (Ctrl+D)">⧉</button>}
    {onCustomize && <button type="button" draggable={false} ref={customizeRef} className="placed-item-toolbar-btn" disabled={disabled} onClick={onCustomize} aria-label="Customize" title="Customize bin options">⚙</button>}
    {onDelete && <button type="button" draggable={false} className="placed-item-toolbar-btn placed-item-toolbar-btn--danger" disabled={disabled} onClick={onDelete} aria-label="Remove item" title="Remove item (Del)">🗑</button>}
  </div>;
}
