import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { GuestPreview, GuestBinModel } from '@gridfinity/shared';
import { apiFetch, ApiError } from '../api/apiClient';
import type { GuestPreviewResponse } from '@gridfinity/shared';
import './GuestPreviewPage.css';

function GuestMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="guest-message"><section><p className="guest-brand">ORDINUS</p><h1>{title}</h1>{children}</section></main>;
}
export function GuestPreviewPage({ linkId }: { linkId: string }) {
  const [invitationVersion, setInvitationVersion] = useState(0);
  useEffect(() => {
    // Reopening an invitation in the same tab can be a fragment-only navigation.
    const onInvitationChange = () => setInvitationVersion(version => version + 1);
    window.addEventListener('hashchange', onInvitationChange);
    return () => window.removeEventListener('hashchange', onInvitationChange);
  }, []);
  return <GuestPreviewSession key={`${linkId}:${invitationVersion}`} linkId={linkId} />;
}

function GuestPreviewSession({ linkId }: { linkId: string }) {
  const [secret, setSecret] = useState(() => window.location.hash.slice(1));
  const [joined, setJoined] = useState(() => !window.location.hash);
  const [left, setLeft] = useState(false);
  const validId = /^[a-f0-9]{24}$/.test(linkId);
  const base = `/guest/${linkId}`;
  const preview = useQuery({ queryKey: ['guest-preview', linkId], queryFn: () => apiFetch<GuestPreviewResponse>(`${base}/view`), enabled: validId && joined && !left, retry: false, staleTime: Infinity, refetchOnWindowFocus: false });
  // This checks authorization only. It does not synchronize configuration edits.
  const status = useQuery({ queryKey: ['guest-access', linkId], queryFn: () => apiFetch(`${base}/status`), enabled: validId && joined && preview.isSuccess && !left, retry: false, refetchInterval: 2000, refetchIntervalInBackground: true, refetchOnWindowFocus: true });
  // Readiness polling updates images only; it never synchronizes layout edits.
  const models = useQuery({ queryKey: ['guest-models', linkId], queryFn: () => apiFetch<{ bins: GuestBinModel[] }>(`${base}/models`), enabled: validId && joined && preview.isSuccess && !left, retry: false,
    refetchInterval: query => query.state.data?.bins?.some(bin => bin.status === 'pending') ? 2000 : false });
  const join = useMutation({
    mutationFn: () => apiFetch(`${base}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret }) }),
    onSuccess: () => {
      window.history.replaceState(null, '', window.location.pathname);
      setSecret(''); setJoined(true);
    },
  });
  const leave = useMutation({ mutationFn: () => apiFetch(`${base}/leave`, { method: 'POST' }), onSuccess: () => setLeft(true) });
  if (left) return <GuestMessage title="You left the preview"><p>Your organizer still has the configuration. Open the invitation link to view it again.</p></GuestMessage>;
  const failure = join.error ?? (joined ? preview.error ?? status.error ?? models.error : null);
  const closed = !validId || (failure instanceof ApiError && [401, 404, 410].includes(failure.status));
  if (closed) return <GuestMessage title="Preview unavailable"><p>This link is closed, has expired, or needs its original invitation. Ask your organizer for a new link.</p></GuestMessage>;
  if (!joined) return <GuestMessage title="A drawer configuration has been shared with you">
    <p>Open a read-only preview of this drawer, its bins, and attached reference photos.</p>
    <p>You can inspect the layout without an account.</p>
    {join.isError && <p role="alert">Could not open the preview. Try again.</p>}
    <button type="button" className="guest-primary" disabled={join.isPending} onClick={() => join.mutate()}>{join.isPending ? 'Opening…' : 'Open preview'}</button>
  </GuestMessage>;
  if (preview.isError || status.isError) return <GuestMessage title="Checking preview access"><p role="alert">Connection lost. The preview is hidden until access can be checked.</p><button type="button" onClick={() => { void preview.refetch(); void status.refetch(); }}>Retry</button></GuestMessage>;
  if (preview.isPending || status.isPending) return <GuestMessage title="Opening your drawer"><p role="status">Checking access and loading the saved layout…</p></GuestMessage>;
  return <div className="guest-page">
    <header className="guest-header"><span className="guest-brand">ORDINUS</span><span className="guest-readonly">Read-only preview</span><button type="button" disabled={leave.isPending} onClick={() => leave.mutate()}>Leave preview</button></header>
    <main className="guest-content">
      <div className="guest-heading"><h1>{preview.data.layout.name}</h1><p>{preview.data.layout.widthMm} × {preview.data.layout.depthMm} mm · {(preview.data.layout.widthMm / 25.4).toFixed(2)} × {(preview.data.layout.depthMm / 25.4).toFixed(2)} in</p></div>
      <p className="guest-note">Inspect this saved configuration. Editing and live collaboration will be added in a later version.</p>
      {leave.isError && <p role="alert">Could not leave the preview. Try again.</p>}
      {models.isError && <p role="status">Bin previews could not be loaded. <button type="button" onClick={() => void models.refetch()}>Retry bin previews</button></p>}
      <GuestDrawer layout={preview.data.layout} models={models.data?.bins ?? []} />
      <footer className="guest-footer">Saved {new Date(preview.data.layout.savedAt).toLocaleString()} · Access expires {new Date(preview.data.expiresAt).toLocaleString()}. Reloading loads the latest saved version.</footer>
    </main>
  </div>;
}

function GuestDrawer({ layout, models }: { layout: GuestPreview; models: GuestBinModel[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showImages, setShowImages] = useState(true);
  const [view, setView] = useState<'top' | 'perspective'>('top');
  const [brokenImages, setBrokenImages] = useState<Set<number>>(() => new Set());
  const cols = layout.gridX * layout.gridResolution;
  const rows = layout.gridY * layout.gridResolution;
  const gapX = Math.max(0, layout.widthMm - layout.gridX * 42);
  const gapY = Math.max(0, layout.depthMm - layout.gridY * 42);
  const offset = (mode: string, gap: number) => mode === 'symmetrical' ? gap / 2 : mode === 'one-sided' ? gap : 0;
  return <div className="guest-layout">
    <section className="guest-canvas-section" aria-label="Drawer preview">
      <div className="guest-canvas-tools"><span>{layout.gridX} × {layout.gridY} grid units</span>
        <div className="guest-view-options" role="group" aria-label="Bin view">{(['top', 'perspective'] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === 'top' ? 'Top' : '3D'}</button>)}</div>
        {layout.referenceImages.length > 0 && <label><input type="checkbox" checked={showImages} onChange={event => setShowImages(event.target.checked)} /> Show reference photos</label>}</div>
      <div className="guest-drawer" style={{ aspectRatio: `${layout.widthMm} / ${layout.depthMm}` }}>
        <div className="guest-grid" role="group" aria-label="Drawer layout" style={{
          left: `${offset(layout.spacerHorizontal, gapX) / layout.widthMm * 100}%`, top: `${offset(layout.spacerVertical, gapY) / layout.depthMm * 100}%`,
          width: `${layout.gridX * 42 / layout.widthMm * 100}%`, height: `${layout.gridY * 42 / layout.depthMm * 100}%`, backgroundSize: `${100 / layout.gridX}% ${100 / layout.gridY}%`,
        }}>
          {showImages && layout.referenceImages.filter(image => !brokenImages.has(image.id)).map(image => <div key={image.id} className="guest-reference-image" style={{ left: `${image.x}%`, top: `${image.y}%`, width: `${image.width}%`, height: `${image.height}%` }}>
            <img src={image.url} alt={image.name} style={{ opacity: image.opacity, transform: image.isAligned ? undefined : `scale(${image.scale}) rotate(${image.rotation}deg)` }} onError={() => setBrokenImages(previous => new Set(previous).add(image.id))} />
          </div>)}
          {layout.bins.map((bin, index) => <button type="button" key={bin.id} className={`guest-bin${selected === bin.id ? ' guest-bin-selected' : ''}`} aria-label={`Select bin ${index + 1}: ${bin.name}`} aria-pressed={selected === bin.id} title={`${bin.name}: ${bin.width / layout.gridResolution} × ${bin.depth / layout.gridResolution} units`} style={{ left: `${bin.x / cols * 100}%`, top: `${bin.y / rows * 100}%`, width: `${bin.width / cols * 100}%`, height: `${bin.depth / rows * 100}%` }} onClick={() => setSelected(bin.id)}>
            <GuestBinImage bin={bin} model={models.find(model => model.id === bin.id)} view={view} />
            <span className="guest-model-number">{index + 1}</span>
          </button>)}
        </div>
      </div>
      {!!brokenImages.size && <p role="status">A reference image is unavailable.</p>}
      {models.some(model => model.status === 'pending') && <p role="status">Preparing bin previews. They will appear here when ready.</p>}
      {!layout.bins.length && <p className="guest-empty">This drawer has no bins yet.</p>}
    </section>
    <aside className="guest-bins" aria-label="Bins in this drawer"><h2>Bins <span>({layout.bins.length})</span></h2><p>Select a bin to identify its footprint.</p>
      <ol>{layout.bins.map((bin, index) => <li key={bin.id}><button type="button" aria-label={`Bin ${index + 1}: ${bin.name}`} aria-pressed={selected === bin.id} onClick={() => setSelected(bin.id)}>
        <span className="guest-bin-number">{index + 1}</span><span><strong>{bin.name}</strong><span>{bin.width / layout.gridResolution} × {bin.depth / layout.gridResolution} grid units{bin.heightUnits !== null ? ` · ${bin.heightUnits * 7} mm tall` : ''}</span></span>
      </button></li>)}</ol>
    </aside>
  </div>;
}

function GuestBinImage({ bin, model, view }: { bin: GuestPreview['bins'][number]; model: GuestBinModel | undefined; view: 'top' | 'perspective' }) {
  const url = view === 'top' ? model?.topUrl : model?.perspectiveUrl;
  return url ? <GuestModelImage key={url} url={url} bin={bin} rotation={view === 'top' ? model?.topRotation ?? 0 : 0} view={view} />
    : <span className="guest-model-fallback">{model?.status === 'pending' ? 'Preparing preview' : `${view === 'top' ? 'Top' : '3D'} preview unavailable`}</span>;
}
function GuestModelImage({ url, bin, rotation, view }: { url: string; bin: GuestPreview['bins'][number]; rotation: number; view: 'top' | 'perspective' }) {
  const [broken, setBroken] = useState(false);
  const sideways = rotation === 90 || rotation === 270;
  if (broken) return <span className="guest-model-fallback">{view === 'top' ? 'Top' : '3D'} preview unavailable</span>;
  return <img className="guest-bin-model" src={url} alt={`${bin.name}, ${view === 'top' ? 'top' : '3D'} view`} draggable={false} onError={() => setBroken(true)} style={rotation ? {
    position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    width: `${sideways ? bin.depth / bin.width * 100 : 100}%`, height: `${sideways ? bin.width / bin.depth * 100 : 100}%`,
  } : undefined} />;
}
