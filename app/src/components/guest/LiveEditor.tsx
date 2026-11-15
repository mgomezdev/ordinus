import { useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GuestBinModel, LiveSnapshot, LiveChange, LiveBin } from '@gridfinity/shared';
import { apiFetch } from '../../api/apiClient';
import { useLiveLayout } from '../../hooks/useLiveLayout';
import { LivePlacementCanvas } from './LivePlacementCanvas';
import '../../pages/GuestPreviewPage.css';
import './LiveEditor.css';

type Send = (change: LiveChange, revision: number) => Promise<number | undefined>;
interface LiveEditorProps { base: string; modelBase?: string; owner?: boolean; onExit: () => void }
export function LiveEditor({ base, modelBase = base, owner = false, onExit }: LiveEditorProps) {
  const live = useLiveLayout(base);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [closing, setClosing] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const snapshot = live.snapshot.data;
  const models = useQuery({ queryKey: ['live-models', base], queryFn: () => apiFetch<{ bins: GuestBinModel[] }>(`${modelBase}/models`), enabled: !!snapshot && live.connection !== 'closed', retry: false,
    refetchInterval: query => query.state.data?.bins.some(bin => bin.status === 'pending') ? 2000 : false });
  const visibleSelection = new Set(snapshot?.bins.filter(bin => selected.has(bin.id)).map(bin => bin.id));
  const selectedBin = visibleSelection.size === 1 ? snapshot?.bins.find(bin => visibleSelection.has(bin.id)) : undefined;
  const select = (id: number | null, modifiers?: { shift?: boolean; ctrl?: boolean }) => setSelected(previous => {
    if (id === null) return new Set();
    if (!modifiers?.ctrl && !modifiers?.shift) return new Set([id]);
    const next = new Set(previous);
    if (modifiers.ctrl && next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  if (live.connection === 'closed' || (live.snapshot.isError && !snapshot)) return <main className="guest-message"><section><p className="guest-brand">ORDINUS</p><h1>Session unavailable</h1><p>{live.snapshot.error?.message ?? 'Access has closed or expired. Ask your organizer for a new invitation.'}</p><button type="button" onClick={onExit}>{owner ? 'Back to workspace' : 'Leave session'}</button></section></main>;
  if (!snapshot) return <main className="guest-message"><p role="status">Connecting to your shared drawer…</p></main>;
  async function closeAccess() {
    setClosing(true);
    try { await apiFetch(`${base}/access`, { method: 'DELETE' }); setAccessMessage('Live guest access closed. Your changes are saved.'); }
    catch { setAccessMessage('Could not close access. Try again.'); }
    finally { setClosing(false); }
  }
  const sidebar = <div className="live-controls">
    {selectedBin && <BinEditor key={selectedBin.stableId} snapshot={snapshot} bin={selectedBin} send={live.send} disabled={!live.canEdit} />}
    <LiveDetails title="Add a bin" defaultOpen={!snapshot.bins.length}><AddBin snapshot={snapshot} send={live.send} disabled={!live.canEdit} /></LiveDetails>
    <LiveDetails title="Drawer dimensions and spacers"><DrawerEditor snapshot={snapshot} send={live.send} disabled={!live.canEdit} /></LiveDetails>
  </div>;
  return <div className="guest-page live-page">
    <header className="guest-header"><span className="guest-brand">ORDINUS</span><strong>Live collaboration</strong><button type="button" onClick={onExit}>{owner ? 'Back to workspace' : 'Leave session'}</button></header>
    <main className="guest-content">
      <div className="guest-heading"><h1>{snapshot.layout.name}</h1><p>{snapshot.layout.widthMm} × {snapshot.layout.depthMm} mm</p></div>
      <div className="live-status" role="status"><strong>{live.connection === 'live' ? live.sending ? 'Saving…' : live.ambiguous ? 'Check last change' : 'Live · Saved' : 'Reconnecting… Editing is paused.'}</strong><span>Revision {snapshot.revision}</span><span>Connected: {snapshot.participants.map(person => person.name).join(', ') || 'connecting…'}</span></div>
      <p className="guest-note">Changes save automatically for everyone in this session. Drag and arrange bins just as in the workspace. Flagged placements stay visible for everyone to resolve.</p>
      {live.problem && <p className="live-problem" role="alert">{live.problem}</p>}
      {live.ambiguous && <button type="button" disabled={live.connection !== 'live' || live.sending} onClick={() => void live.retry()}>Retry last change</button>}
      <LivePlacementCanvas snapshot={snapshot} models={models.data?.bins ?? []} selected={visibleSelection} disabled={!live.canEdit}
        onSelect={select} onSelectAll={() => setSelected(new Set(snapshot.layout.bins.map(bin => bin.id)))} sidebar={sidebar} send={live.send}
        renderBinOptions={id => { const bin = snapshot.bins.find(bin => bin.id === id); return bin ? <BinEditor key={bin.stableId} snapshot={snapshot} bin={bin} send={live.send} disabled={!live.canEdit} optionsOnly /> : null; }} />
      {models.isError && <p role="status">Bin images are temporarily unavailable. The drawer footprints remain visible.</p>}
      {owner && <div className="live-access"><button type="button" disabled={closing} onClick={() => void closeAccess()}>{closing ? 'Closing…' : 'Close live guest access'}</button><p>Closes every live invitation for this drawer and disconnects its guests. Saved changes are kept.</p>{accessMessage && <p role="status">{accessMessage}</p>}</div>}
    </main>
  </div>;
}
function LiveDetails({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className="live-disclosure"><button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{title}</button>{open && children}</section>;
}
function RevisionNotice({ base, current, rebase }: { base: number; current: number; rebase: () => void }) {
  return base !== current ? <div className="live-revision" role="status"><p>The drawer changed while these values were open. Review the current layout before retrying.</p><button type="button" onClick={rebase}>Use latest revision for these values</button></div> : null;
}
function BinEditor({ snapshot, bin, send, disabled, optionsOnly = false }: { snapshot: LiveSnapshot; bin: LiveBin; send: Send; disabled: boolean; optionsOnly?: boolean }) {
  const placed = snapshot.layout.bins.find(item => item.id === bin.id)!;
  const [revision, setRevision] = useState(snapshot.revision);
  const [x, setX] = useState(String(placed.x / 2)), [y, setY] = useState(String(placed.y / 2));
  const [height, setHeight] = useState(bin.height), [lipStyle, setLip] = useState(bin.lipStyle as 'normal' | 'reduced' | 'minimum' | 'none'), [pattern, setPattern] = useState(bin.wallPatternEnabled);
  const apply = async (change: LiveChange) => { const next = await send(change, revision); if (next !== undefined) setRevision(next); };
  return <section className="live-bin-editor" aria-label={optionsOnly ? 'Bin options' : 'Selected bin'}><h2>{placed.name}</h2>
    <fieldset disabled={disabled}>{!optionsOnly && <><legend>Position</legend><form onSubmit={event => { event.preventDefault(); void apply({ type: 'move', stableId: bin.stableId, x: Number(x) * 2, y: Number(y) * 2 }); }}>
      <div className="live-fields"><label>X position<input type="number" min="0" max="20" step="0.5" required value={x} onChange={event => setX(event.target.value)} /></label><label>Y position<input type="number" min="0" max="20" step="0.5" required value={y} onChange={event => setY(event.target.value)} /></label></div><button type="submit">Move bin</button>
    </form><div className="live-buttons"><button type="button" onClick={() => void apply({ type: 'rotate', stableId: bin.stableId, direction: 'ccw' })}>Rotate left</button><button type="button" onClick={() => void apply({ type: 'rotate', stableId: bin.stableId, direction: 'cw' })}>Rotate right</button><button type="button" onClick={() => void apply({ type: 'remove', stableId: bin.stableId })}>Remove bin</button></div></>}
    {bin.customizable && <form onSubmit={event => { event.preventDefault(); void apply({ type: 'customize', stableId: bin.stableId, height, lipStyle, wallPatternEnabled: pattern }); }}>
      <label>Height units (7 mm)<input type="number" min={bin.heightStep ?? 1} max="20" step={bin.heightStep ?? 1} required value={height} onChange={event => setHeight(Number(event.target.value))} /></label>
      <label>Lip style<select value={lipStyle} onChange={event => setLip(event.target.value as typeof lipStyle)}>{['normal', 'reduced', 'minimum', 'none'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="live-check"><input type="checkbox" checked={pattern} onChange={event => setPattern(event.target.checked)} /> Wall pattern</label><button type="submit">Apply bin options</button>
    </form>}
    <RevisionNotice base={revision} current={snapshot.revision} rebase={() => setRevision(snapshot.revision)} />
    </fieldset>
  </section>;
}
function AddBin({ snapshot, send, disabled }: { snapshot: LiveSnapshot; send: Send; disabled: boolean }) {
  const [revision, setRevision] = useState(snapshot.revision), [key, setKey] = useState('');
  const [x, setX] = useState('0'), [y, setY] = useState('0');
  return <fieldset disabled={disabled}><form aria-label="Add bin" onSubmit={event => { event.preventDefault(); void send({ type: 'add', catalogKey: key, x: Number(x) * 2, y: Number(y) * 2 }, revision).then(next => { if (next !== undefined) setRevision(next); }); }}>
    <label>Approved bin<select value={key} required onChange={event => setKey(event.target.value)}><option value="">Choose a bin</option>{snapshot.catalog.map(item => <option key={item.key} value={item.key}>{item.name} · {item.width} × {item.depth}</option>)}</select></label>
    <div className="live-fields"><label>Add X position<input type="number" min="0" max="20" step="0.5" required value={x} onChange={event => setX(event.target.value)} /></label><label>Add Y position<input type="number" min="0" max="20" step="0.5" required value={y} onChange={event => setY(event.target.value)} /></label></div>
    <button type="submit" disabled={!key}>Place bin</button><RevisionNotice base={revision} current={snapshot.revision} rebase={() => setRevision(snapshot.revision)} />
  </form></fieldset>;
}
function DrawerEditor({ snapshot, send, disabled }: { snapshot: LiveSnapshot; send: Send; disabled: boolean }) {
  const [revision, setRevision] = useState(snapshot.revision), [width, setWidth] = useState(snapshot.layout.widthMm), [depth, setDepth] = useState(snapshot.layout.depthMm);
  const [horizontal, setHorizontal] = useState(snapshot.layout.spacerHorizontal as 'none' | 'one-sided' | 'symmetrical'), [vertical, setVertical] = useState(snapshot.layout.spacerVertical as typeof horizontal);
  return <fieldset disabled={disabled}><form aria-label="Drawer dimensions" onSubmit={event => { event.preventDefault(); void send({ type: 'drawer', widthMm: width, depthMm: depth, spacerHorizontal: horizontal, spacerVertical: vertical }, revision).then(next => { if (next !== undefined) setRevision(next); }); }}>
    <div className="live-fields"><label>Drawer width (mm)<input type="number" min="42" max="881.999" step="any" required value={width} onChange={event => setWidth(Number(event.target.value))} /></label><label>Drawer depth (mm)<input type="number" min="42" max="881.999" step="any" required value={depth} onChange={event => setDepth(Number(event.target.value))} /></label></div>
    <label>Horizontal spacers<select value={horizontal} onChange={event => setHorizontal(event.target.value as typeof horizontal)}>{['none', 'one-sided', 'symmetrical'].map(value => <option key={value}>{value}</option>)}</select></label>
    <label>Vertical spacers<select value={vertical} onChange={event => setVertical(event.target.value as typeof vertical)}>{['none', 'one-sided', 'symmetrical'].map(value => <option key={value}>{value}</option>)}</select></label>
    <button type="submit">Apply drawer changes</button><RevisionNotice base={revision} current={snapshot.revision} rebase={() => setRevision(snapshot.revision)} />
  </form></fieldset>;
}
