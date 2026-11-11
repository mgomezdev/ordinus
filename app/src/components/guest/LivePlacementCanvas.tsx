import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KeyboardEvent, ReactNode } from 'react';
import type { GuestBinModel, LiveChange, LivePlacementChange, LiveSnapshot } from '@gridfinity/shared';
import type { DragData, PlacedItem, Rotation } from '../../types/gridfinity';
import { usePointerDragSource, usePointerDropTarget } from '../../hooks/usePointerDrag';
import type { SnapPreviewData } from '../../hooks/usePointerDrag';
import { findValidPosition, hasCollision, isOutOfBounds } from '../../hooks/useGridItems';
import { useGridTransform } from '../../hooks/useGridTransform';
import { GridViewport } from '../GridViewport';
import { SnapPreviewOverlay } from '../SnapPreviewOverlay';
import { BinContextMenu } from '../BinContextMenu';
import { BinPlacementToolbar } from '../BinPlacementToolbar';
import { GuestBinImage } from './GuestDrawer';

type Send = (change: LiveChange, revision: number) => Promise<number | undefined>;
type Selection = (id: number | null, modifiers?: { shift?: boolean; ctrl?: boolean }) => void;
interface LiveDrag extends DragData { revision: number; width: number; depth: number; selected: number[] }
interface Props {
  snapshot: LiveSnapshot; models: GuestBinModel[]; disabled: boolean;
  selected: Set<number>; onSelect: Selection; onSelectAll: () => void; send: Send; sidebar: ReactNode;
  renderBinOptions?: (id: number) => ReactNode;
}

/** The workspace pointer, snapping, collision and viewport primitives, using only scoped live data. */
export function LivePlacementCanvas({ snapshot, models, disabled, selected, onSelect, onSelectAll, send, sidebar, renderBinOptions }: Props) {
  const { layout, revision } = snapshot;
  const gridRef = useRef<HTMLDivElement>(null), viewportRef = useRef<HTMLDivElement>(null);
  const space = useRef(false), clipboard = useRef<number[]>([]);
  const [preview, setPreview] = useState<SnapPreviewData | null>(null);
  const [view, setView] = useState<'top' | 'perspective'>('top');
  const [showImages, setShowImages] = useState(true), [problem, setProblem] = useState('');
  const [menu, setMenu] = useState<{ id: number; x: number; y: number; revision: number } | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState('');
  const [customize, setCustomize] = useState<{ id: number; left: number; top: number } | null>(null);
  const libraryNames = [...new Set(snapshot.catalog.map(item => item.libraryName).filter((name): name is string => !!name))];
  const [brokenImages, setBrokenImages] = useState<Set<number>>(() => new Set());
  const transform = useGridTransform();
  const cols = layout.gridX * layout.gridResolution, rows = layout.gridY * layout.gridResolution;
  const items: PlacedItem[] = layout.bins.map(bin => ({ instanceId: String(bin.id), itemId: '', x: bin.x, y: bin.y, width: bin.width, height: bin.depth, rotation: bin.rotation as Rotation }));
  const invalid = (bin: typeof layout.bins[number]) => isOutOfBounds(bin.x, bin.y, bin.width, bin.depth, cols, rows)
    || hasCollision(items, bin.x, bin.y, bin.width, bin.depth, String(bin.id))
    || (snapshot.bins.find(item => item.id === bin.id)?.snapStep === 2 && [bin.x, bin.y, bin.width, bin.depth].some(value => value % 2 !== 0));
  const invalidBins = layout.bins.filter(invalid);
  const stable = (id: number) => snapshot.bins.find(bin => bin.id === id)?.stableId;
  const commit = (changes: LivePlacementChange[], base = revision) => {
    if (disabled || !changes.length) return;
    setProblem('');
    void send(changes.length === 1 ? changes[0] : { type: 'batch', changes }, base);
  };
  function drop(data: DragData, x: number, y: number) {
    if (disabled) return;
    const drag = data as LiveDrag;
    if (drag.type === 'library') {
      const position = findValidPosition(items, drag.width, drag.depth, x, y, cols, rows, drag.snapStep);
      if (!position) { setProblem('No free space for this bin. Move or remove a bin first.'); return; }
      setProblem(''); void send({ type: 'add', catalogKey: drag.itemId, ...position }, drag.revision);
    } else {
      const bin = layout.bins.find(bin => stable(bin.id) === drag.instanceId);
      if (!bin) return;
      const group = drag.selected.includes(bin.id) && drag.selected.length > 1 ? layout.bins.filter(bin => drag.selected.includes(bin.id)) : [bin];
      const dx = x - bin.x, dy = y - bin.y;
      if (group.length > 1 && group.some(bin => isOutOfBounds(bin.x + dx, bin.y + dy, bin.width, bin.depth, cols, rows)
        || hasCollision(items.filter(item => !group.some(bin => String(bin.id) === item.instanceId)), bin.x + dx, bin.y + dy, bin.width, bin.depth))) {
        setProblem('The selected bins cannot fit there together. Choose a free position.'); return;
      }
      commit(group.map(bin => ({ type: 'move', stableId: stable(bin.id)!, x: bin.x + dx, y: bin.y + dy })), drag.revision);
    }
  }
  usePointerDropTarget({ gridRef, gridX: layout.gridX, gridY: layout.gridY, onDrop: drop, onSnapChange: setPreview });
  useEffect(() => {
    const release = (event: globalThis.KeyboardEvent) => { if (event.key === ' ') space.current = false; };
    const blur = () => { space.current = false; };
    window.addEventListener('keyup', release); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keyup', release); window.removeEventListener('blur', blur); };
  }, []);
  function duplicate(ids: number[], base = revision) {
    const occupied = [...items]; const changes: LivePlacementChange[] = [];
    for (const bin of layout.bins.filter(bin => ids.includes(bin.id))) {
      const position = findValidPosition(occupied, bin.width, bin.depth, bin.x + 2, bin.y + 2, cols, rows, snapshot.bins.find(item => item.id === bin.id)?.snapStep ?? 1);
      if (!position) { setProblem('No free space for the copied bins. Move or remove a bin first.'); return; }
      changes.push({ type: 'duplicate', stableId: stable(bin.id)!, ...position });
      occupied.push({ instanceId: `copy-${bin.id}`, itemId: '', ...position, width: bin.width, height: bin.depth, rotation: bin.rotation as Rotation });
    }
    commit(changes, base);
  }
  function keyDown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    if ((event.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase(), command = event.ctrlKey || event.metaKey;
    if (key === 'escape') { onSelect(null); setProblem(''); setCustomize(null); return; }
    if (key === ' ' && !(event.target as HTMLElement).closest('button')) { space.current = true; event.preventDefault(); return; }
    if (key === '+' || key === '=') { event.preventDefault(); transform.zoomIn(); return; }
    if (key === '-' || key === '_') { event.preventDefault(); transform.zoomOut(); return; }
    if (command && key === '0') { event.preventDefault(); transform.resetZoom(); return; }
    if (key === 'v' && !command) { setView(value => value === 'top' ? 'perspective' : 'top'); return; }
    if (command && key === 'a') { event.preventDefault(); onSelectAll(); return; }
    if (disabled) return;
    if (command && key === 'c') { event.preventDefault(); clipboard.current = [...selected]; return; }
    if (command && (key === 'd' || key === 'v')) { event.preventDefault(); duplicate(key === 'd' ? [...selected] : clipboard.current); return; }
    const bins = layout.bins.filter(bin => selected.has(bin.id));
    if (key === 'delete' || key === 'backspace') { event.preventDefault(); commit(bins.map(bin => ({ type: 'remove', stableId: stable(bin.id)! }))); return; }
    if (key === 'r') { event.preventDefault(); commit(bins.map(bin => ({ type: 'rotate', stableId: stable(bin.id)!, direction: event.shiftKey ? 'ccw' : 'cw' }))); return; }
    const direction = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[key];
    if (direction && bins.length) {
      event.preventDefault();
      const step = bins.some(bin => snapshot.bins.find(item => item.id === bin.id)?.snapStep === 2) ? 2 : 1;
      const changes = bins.map(bin => ({ type: 'move' as const, stableId: stable(bin.id)!, x: bin.x + direction[0] * step, y: bin.y + direction[1] * step }));
      if (changes.every(change => change.x >= 0 && change.y >= 0 && change.x <= 40 && change.y <= 40)) commit(changes);
    }
  }
  const fit = () => {
    const viewport = viewportRef.current, drawer = gridRef.current?.parentElement;
    if (viewport && drawer) transform.fitToScreen(viewport.clientWidth, viewport.clientHeight, drawer.offsetWidth, drawer.offsetHeight);
  };
  const dragPreview = preview?.dragData as LiveDrag | undefined;
  const validPreview = preview && dragPreview && !isOutOfBounds(preview.col, preview.row, dragPreview.width, dragPreview.depth, cols, rows)
    && !hasCollision(items, preview.col, preview.row, dragPreview.width, dragPreview.depth, String(layout.bins.find(bin => stable(bin.id) === dragPreview.instanceId)?.id));
  const gapX = Math.max(0, layout.widthMm - layout.gridX * 42), gapY = Math.max(0, layout.depthMm - layout.gridY * 42);
  const offset = (mode: string, gap: number) => mode === 'symmetrical' ? gap / 2 : mode === 'one-sided' ? gap : 0;
  return <div className="guest-layout live-placement" onKeyDown={keyDown}>
    <section className="guest-canvas-section" aria-label="Drawer editor">
      <div className="guest-canvas-tools"><span>{layout.gridX} × {layout.gridY} grid units</span>
        <div className="guest-view-options" role="group" aria-label="Bin view">{(['top', 'perspective'] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === 'top' ? 'Top' : '3D'}</button>)}</div>
        {!!layout.referenceImages.length && <label><input type="checkbox" checked={showImages} onChange={event => setShowImages(event.target.checked)} /> Show reference photos</label>}
      </div>
      <div className="live-selection-tools" role="toolbar" aria-label="Placement controls">
        <button type="button" onClick={onSelectAll}>Select all</button><button type="button" disabled={!selected.size} onClick={() => onSelect(null)}>Deselect</button>
        <button type="button" disabled={disabled || !selected.size} onClick={() => duplicate([...selected])}>Duplicate selected</button>
        <button type="button" disabled={disabled || !selected.size} onClick={() => commit([...selected].flatMap(id => stable(id) ? [{ type: 'rotate' as const, stableId: stable(id)!, direction: 'cw' as const }] : []))}>Rotate selected</button>
        <button type="button" disabled={disabled || !selected.size} onClick={() => commit([...selected].flatMap(id => stable(id) ? [{ type: 'remove' as const, stableId: stable(id)! }] : []))}>Delete selected</button>
        <span>{selected.size} selected</span>
        <button type="button" className="live-library-toggle" aria-expanded={libraryOpen} onClick={() => setLibraryOpen(value => !value)}>Bin library</button>
      </div>
      {problem && <p role="alert">{problem}</p>}
      <p className="live-validity" role="status">{invalidBins.length ? `${invalidBins.length} ${invalidBins.length === 1 ? 'bin needs' : 'bins need'} attention: overlapping, outside the drawer or off its supported grid. Move, rotate or remove the flagged bins.` : 'All bins fit without overlaps.'}</p>
      <GridViewport {...transform} isSpaceHeldRef={space} viewportRef={viewportRef} zoomOverlayProps={{ zoom: transform.transform.zoom, onZoomIn: transform.zoomIn, onZoomOut: transform.zoomOut, onResetZoom: transform.resetZoom, onFitToScreen: fit, showResetZoom: true }}>
        <div className="guest-drawer" style={{ aspectRatio: `${layout.widthMm} / ${layout.depthMm}` }}>
          <div ref={gridRef} className="guest-grid" role="group" aria-label="Drawer layout" tabIndex={0} onClick={event => { if (event.target === event.currentTarget) onSelect(null); }} style={{
            left: `${offset(layout.spacerHorizontal, gapX) / layout.widthMm * 100}%`, top: `${offset(layout.spacerVertical, gapY) / layout.depthMm * 100}%`,
            width: `${layout.gridX * 42 / layout.widthMm * 100}%`, height: `${layout.gridY * 42 / layout.depthMm * 100}%`, backgroundSize: `${100 / layout.gridX}% ${100 / layout.gridY}%`,
          }}>
            {showImages && layout.referenceImages.filter(image => !brokenImages.has(image.id)).map(image => <div key={image.id} className="guest-reference-image" style={{ left: `${image.x}%`, top: `${image.y}%`, width: `${image.width}%`, height: `${image.height}%` }}><img src={image.url} alt={image.name} style={{ opacity: image.opacity, transform: image.isAligned ? undefined : `scale(${image.scale}) rotate(${image.rotation}deg)` }} onError={() => setBrokenImages(previous => new Set(previous).add(image.id))} /></div>)}
            {preview && dragPreview && <SnapPreviewOverlay col={preview.col} row={preview.row} w={dragPreview.width} d={dragPreview.depth} valid={!!validPreview} gridX={layout.gridX} gridY={layout.gridY} />}
            {layout.bins.map((bin, index) => <LiveDragSource key={bin.id} data={{ type: 'placed', itemId: stable(bin.id)!, instanceId: stable(bin.id), snapStep: snapshot.bins.find(item => item.id === bin.id)?.snapStep ?? 1, revision, width: bin.width, depth: bin.depth, selected: [...selected] }}
              disabled={disabled} isPanning={() => space.current} className={`guest-bin guest-bin-movable${selected.has(bin.id) ? ' guest-bin-selected' : ''}${invalid(bin) ? ' live-bin-invalid' : ''}`} label={`Select bin ${index + 1}: ${bin.name}`} selected={selected.has(bin.id)}
              onSelect={modifiers => onSelect(bin.id, modifiers)} onContextMenu={event => { event.preventDefault(); if (!disabled) { onSelect(bin.id); setMenu({ id: bin.id, x: event.clientX, y: event.clientY, revision }); } }} style={{ left: `${bin.x / cols * 100}%`, top: `${bin.y / rows * 100}%`, width: `${bin.width / cols * 100}%`, height: `${bin.depth / rows * 100}%` }}>
              <GuestBinImage bin={bin} model={models.find(model => model.id === bin.id)} view={view} /><span className="guest-model-number">{index + 1}{invalid(bin) ? ' !' : ''}</span>
              {selected.size === 1 && selected.has(bin.id) && <LiveBinToolbar disabled={disabled} geometry={`${bin.x}:${bin.y}:${bin.width}:${bin.depth}:${transform.transform.zoom}:${transform.transform.panX}:${transform.transform.panY}`}
                onRotateCcw={() => commit([{ type: 'rotate', stableId: stable(bin.id)!, direction: 'ccw' }])} onRotateCw={() => commit([{ type: 'rotate', stableId: stable(bin.id)!, direction: 'cw' }])}
                onDuplicate={() => duplicate([bin.id])} onDelete={() => commit([{ type: 'remove', stableId: stable(bin.id)! }])}
                onCustomize={snapshot.bins.find(item => item.id === bin.id)?.customizable && renderBinOptions ? rect => setCustomize({ id: bin.id, left: Math.max(8, Math.min(rect.left, window.innerWidth - 316)), top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 420)) }) : undefined} />}
            </LiveDragSource>)}
          </div>
        </div>
      </GridViewport>
      <p className="live-placement-help">Drag bins or drag a bin from the library. Shift/Ctrl-click to select multiple bins. R rotates; Delete removes; Ctrl/Cmd+D duplicates; Ctrl/Cmd+C/V copies and pastes. Use +/− to zoom, Space-drag or middle-drag to pan, and pinch on touch screens.</p>
      {models.some(model => model.status === 'pending') && <p role="status">Preparing bin previews. They will appear here when ready.</p>}
    </section>
    <aside className="guest-bins" aria-label="Bins in this drawer"><h2>Bins <span>({layout.bins.length})</span></h2><p>Select a bin to edit its options.</p>
      <ol>{layout.bins.map((bin, index) => <li key={bin.id}><button type="button" aria-label={`Bin ${index + 1}: ${bin.name}`} aria-pressed={selected.has(bin.id)} onClick={event => onSelect(bin.id, { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey })}><span className="guest-bin-number">{index + 1}</span><span><strong>{bin.name}</strong><span>{bin.width / layout.gridResolution} × {bin.depth / layout.gridResolution} grid units{bin.heightUnits !== null ? ` · ${bin.heightUnits * 7} mm tall` : ''}</span>{invalid(bin) && <span className="live-bin-warning">Overlapping or outside drawer</span>}</span></button></li>)}</ol>
      <section className={`live-library${libraryOpen ? ' live-library-open' : ''}`} aria-label="Approved bin library"><h2>Bin library</h2><button type="button" className="live-library-toggle" onClick={() => setLibraryOpen(false)}>Close library</button><p>Drag a footprint into the drawer, or use Add a bin below.</p>
        {libraryNames.length > 1 && <label>Filter bin library<select value={library} onChange={event => setLibrary(event.target.value)}><option value="">All approved libraries</option>{libraryNames.map(name => <option key={name}>{name}</option>)}</select></label>}
        <div className="live-library-items">{snapshot.catalog.filter(item => !library || item.libraryName === library).map(item => <LiveDragSource key={item.key} data={{ type: 'library', itemId: item.key, snapStep: item.snapStep ?? 1, revision, width: item.width * 2, depth: item.depth * 2, selected: [] }} onDragStart={() => setLibraryOpen(false)} disabled={disabled} className="live-library-item" label={`Drag ${item.name} into drawer`}><span className="live-library-footprint" style={{ aspectRatio: `${item.width} / ${item.depth}` }} /><strong>{item.name}</strong><span>{item.width} × {item.depth}{libraryNames.length > 1 ? ` · ${item.libraryName ?? ''}` : ''}</span></LiveDragSource>)}</div></section>
      {sidebar}
    </aside>
    {menu && stable(menu.id) && <BinContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}
      onRotateCw={() => commit([{ type: 'rotate', stableId: stable(menu.id)!, direction: 'cw' }], menu.revision)}
      onRotateCcw={() => commit([{ type: 'rotate', stableId: stable(menu.id)!, direction: 'ccw' }], menu.revision)}
      onDuplicate={() => duplicate([menu.id], menu.revision)} onDelete={() => commit([{ type: 'remove', stableId: stable(menu.id)! }], menu.revision)} />}
    {customize && selected.size === 1 && selected.has(customize.id) && snapshot.bins.some(bin => bin.id === customize.id) && createPortal(<div role="dialog" aria-label="Customize bin" className="placed-item-customize-popover live-options-popover live-controls" style={{ position: 'fixed', left: customize.left, top: customize.top }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') setCustomize(null); }}>
      <div className="placed-item-customize-popover-header"><strong>Customize</strong><button type="button" aria-label="Close customization" onClick={() => setCustomize(null)}>×</button></div>{renderBinOptions?.(customize.id)}
    </div>, document.body)}
  </div>;
}

function LiveBinToolbar({ geometry, disabled, onRotateCcw, onRotateCw, onDuplicate, onDelete, onCustomize }: {
  geometry: string; disabled: boolean; onRotateCcw: () => void; onRotateCw: () => void; onDuplicate: () => void; onDelete: () => void; onCustomize?: (rect: DOMRect) => void;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const update = () => {
      const rect = anchor.current?.parentElement?.getBoundingClientRect(); if (!rect) return;
      const width = Math.min(window.innerWidth - 16, (onCustomize ? 5 : 4) * (window.innerWidth <= 768 ? 44 : 28) + 16);
      setPosition({ left: Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8)), top: rect.top > 56 ? rect.top - 48 : rect.bottom + 4 });
    };
    update(); window.addEventListener('scroll', update, true); window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [geometry, onCustomize]);
  return <span ref={anchor}>{position && createPortal(<BinPlacementToolbar disabled={disabled} style={{ position: 'fixed', ...position, transform: 'none', zIndex: 1000 }} onRotateCcw={onRotateCcw} onRotateCw={onRotateCw} onDuplicate={onDuplicate} onDelete={onDelete} onCustomize={onCustomize ? event => onCustomize(event.currentTarget.getBoundingClientRect()) : undefined} />, document.body)}</span>;
}

function LiveDragSource({ data, disabled, isPanning, onSelect, onContextMenu, onDragStart, children, className, label, selected, style }: {
  data: LiveDrag; disabled: boolean; isPanning?: () => boolean; onSelect?: (modifiers: { shift: boolean; ctrl: boolean }) => void; children: ReactNode;
  className: string; label: string; selected?: boolean; style?: React.CSSProperties;
  onContextMenu?: (event: React.MouseEvent) => void;
  onDragStart?: () => void;
}) {
  const drag = usePointerDragSource({ dragData: data, onDragStart, onTap: event => onSelect?.({ shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey }) });
  return <div role="button" tabIndex={0} aria-label={label} aria-pressed={selected} aria-disabled={disabled} className={className} style={style} onContextMenu={onContextMenu}
    onPointerDown={event => { if (!disabled && !isPanning?.()) { event.currentTarget.focus({ preventScroll: true }); drag.onPointerDown(event); } }}
    onClick={event => { if (event.detail === 0) onSelect?.({ shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey }); }}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.({ shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey }); } }}>
    {children}
  </div>;
}
