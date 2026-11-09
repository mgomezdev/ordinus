import { useState } from 'react';
import { GRID_RESOLUTION, matchCuratedEntry } from '@gridfinity/shared';
import type { CuratedEntry, CuratedLibrary } from '@gridfinity/shared';
import { useCuratedLibraries } from '../../hooks/useCuratedLibraries';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { violatesHalfGrid } from '../../utils/snap';
import { CuratedLibraryEditor } from './CuratedLibraryEditor';
import type { DrawnFootprint } from './DrawFootprint';
import './simple.css';

interface Props {
  width: number; isMobile: boolean; isOpen: boolean; selection: DrawnFootprint | null;
  valid: boolean; drawing: boolean; busy: boolean;
  onDraw: () => void; onCancel: () => void; onSelection: (value: DrawnFootprint) => void;
  onPlaced: () => void; onBusy: (value: boolean) => void;
}

export function SimpleLibraryPanel({ width, isMobile, isOpen, selection, valid, drawing, busy, onDraw, onCancel, onSelection, onPlaced, onBusy }: Props) {
  const { libraryItems, getItemById, placeCuratedBin } = useWorkspace();
  const data = useCuratedLibraries();
  const [libraryId, setLibraryId] = useState('');
  const [entryId, setEntryId] = useState('');
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState<{ library: CuratedLibrary; existing: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState({ x: 0, y: 0, width: 1, depth: 1 });
  const library = data.libraries.find(l => l.id === libraryId) ?? data.libraries[0];
  const sourceAvailable = (e: CuratedEntry) => {
    if (e.kind === 'parametric') return true;
    const source = getItemById(e.sourceId);
    return source && source.isActive !== false && source.widthUnits === e.width && source.heightUnits === e.depth;
  };
  const matching = (e: CuratedEntry, selected: Record<string, string> = {}) => selection ? matchCuratedEntry(e, selection.width / GRID_RESOLUTION, selection.depth / GRID_RESOLUTION, selected, resolved => !violatesHalfGrid({
    x: selection.x, y: selection.y, width: selection.width, height: selection.depth,
    customSpec: resolved.spec, parameters: e.kind === 'fixed' ? getItemById(e.sourceId)?.parameters : undefined,
  })) : null;
  const compatible = library?.entries.filter(e => sourceAvailable(e) && matching(e)) ?? [];
  const entry = compatible.find(e => e.id === entryId) ?? compatible[0];
  const match = entry ? matching(entry, choices) : null;
  const chosen = match?.choices ?? choices;
  const place = async () => {
    if (!entry || !selection || !valid || !match || busy) return;
    onBusy(true); setError(null);
    try {
      const placed = await placeCuratedBin(entry, selection.width / GRID_RESOLUTION, selection.depth / GRID_RESOLUTION, chosen, selection.x, selection.y);
      if (placed) { onPlaced(); setChoices({}); }
      else setError('This bin can no longer be placed here. Check the rectangle and choose again.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Placement failed. Try again.'); }
    finally { onBusy(false); }
  };
  return <section className={`library-panel simple-library${isOpen ? ' library-panel--open' : ''}`} style={isMobile ? undefined : { width, minWidth: width }} aria-label="Simple bin library">
    <div className="library-panel-header"><div className="library-panel-header-text"><span className="library-panel-title">Simple layouts</span><span className="library-panel-subtitle">Draw a space. Choose a bin.</span></div></div>
    <div className="library-panel-content simple-content">
      {data.isLoading && <p role="status">Loading your libraries…</p>}
      {data.error && <p role="alert">Libraries could not load. <button type="button" onClick={() => void data.refetch()}>Retry</button></p>}
      {editor ? <CuratedLibraryEditor key={editor.library.id} initial={editor.library} items={libraryItems.filter(item => item.isActive !== false)} pending={data.save.isPending || data.remove.isPending} error={error}
        onCancel={() => { setEditor(null); setError(null); }}
        onSave={async edited => {
          setError(null);
          try { await data.save.mutateAsync({ library: edited, existing: editor.existing }); setLibraryId(edited.id); setEditor(null); }
          catch (err) { setError(err instanceof Error ? err.message : 'Library could not be saved.'); }
        }}
        onDelete={editor.existing ? async () => {
          setError(null);
          try { await data.remove.mutateAsync(editor.library.id); setEditor(null); setLibraryId(''); }
          catch (err) { setError(err instanceof Error ? err.message : 'Library could not be deleted.'); }
        } : undefined}
      /> : <>
        {library ? <>
          <label>Bin library<select disabled={busy} value={library.id} onChange={e => { setLibraryId(e.target.value); setEntryId(''); setChoices({}); setError(null); }}>
            {data.libraries.map(l => <option value={l.id} key={l.id}>{l.name}</option>)}
          </select></label>
          {library.description && <p className="simple-help">{library.description}</p>}
          <button type="button" disabled={busy} onClick={() => { onCancel(); setError(null); setEditor({ library, existing: true }); }}>Edit library</button>
        </> : !data.isLoading && !data.error && <p>Create a library with your favorite bins and friendly options, then draw where each bin should go.</p>}
        <button type="button" disabled={busy || data.isLoading} onClick={() => { onCancel(); setError(null); setEditor({ library: { id: crypto.randomUUID(), name: '', description: '', entries: [] }, existing: false }); }}>New library</button>
        {library && <>
          <hr />
          <p className="simple-help">Draw a rectangle on the grid, then choose a bin. Sizes are in grid units. Use two fingers or Space + drag to pan.</p>
          <div className="simple-row"><button type="button" disabled={busy} aria-pressed={drawing} onClick={() => { setError(null); setChoices({}); onDraw(); }}>{selection ? 'Redraw bin' : 'Draw bin'}</button>
            {(drawing || selection) && <button type="button" disabled={busy} onClick={() => { onCancel(); setChoices({}); setError(null); }}>Cancel</button>}</div>
          <details><summary>Enter a rectangle with the keyboard</summary>
            <div className="simple-coordinate-fields">{(['x', 'y', 'width', 'depth'] as const).map(key => <label key={key}>{key === 'x' ? 'Column' : key === 'y' ? 'Row' : key === 'width' ? 'Width' : 'Depth'}<input disabled={busy} type="number" min={key === 'x' || key === 'y' ? 0 : 0.5} step="0.5" value={fields[key]} onChange={e => setFields({ ...fields, [key]: Number(e.target.value) })} /></label>)}</div>
            <button type="button" disabled={busy || !Object.values(fields).every(Number.isFinite) || fields.width <= 0 || fields.depth <= 0 || !Object.values(fields).every(v => Number.isInteger(v * GRID_RESOLUTION))} onClick={() => { setChoices({}); onSelection({ x: fields.x * GRID_RESOLUTION, y: fields.y * GRID_RESOLUTION, width: fields.width * GRID_RESOLUTION, depth: fields.depth * GRID_RESOLUTION }); }}>Use footprint</button>
          </details>
          {selection && <>
            <h3>{selection.width / GRID_RESOLUTION} × {selection.depth / GRID_RESOLUTION} footprint</h3>
            {!valid && <p role="alert" className="simple-error">Choose an empty rectangle inside the grid.</p>}
            {compatible.length ? <>
              <label>Choose a bin<select disabled={busy} value={entry?.id ?? ''} onChange={e => { setEntryId(e.target.value); setChoices({}); setError(null); }}>{compatible.map(e => <option value={e.id} key={e.id}>{e.name}</option>)}</select></label>
              {entry?.kind === 'parametric' && entry.groups.map(group => <label key={group.id}>{group.name}<select disabled={busy} value={chosen[group.id] ?? ''} onChange={e => setChoices({ ...chosen, [group.id]: e.target.value })}>
                {group.choices.map(choice => <option key={choice.id} value={choice.id} disabled={!matching(entry, { ...chosen, [group.id]: choice.id })}>{choice.name}</option>)}
              </select></label>)}
              {match?.rotation === 90 && <p className="simple-help">This bin will be rotated to fit.</p>}
              {!match && <p role="alert" className="simple-error">These options do not fit. Choose the bin again to reset its options.</p>}
              <button type="button" disabled={busy || !valid || !match} onClick={() => void place()}>{busy ? 'Placing…' : 'Place bin'}</button>
            </> : <p role="status">No bins in this library fit this rectangle. Draw a different size or choose another library.</p>}
          </>}
        </>}
        {error && <p role="alert" className="simple-error">{error}</p>}
      </>}
    </div>
  </section>;
}
