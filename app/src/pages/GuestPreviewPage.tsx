import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { GuestBinModel } from '@gridfinity/shared';
import { apiFetch, ApiError } from '../api/apiClient';
import type { GuestPreviewResponse } from '@gridfinity/shared';
import './GuestPreviewPage.css';
import { GuestDrawer } from '../components/guest/GuestDrawer';
import { LiveEditor } from '../components/guest/LiveEditor';

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
  const [displayName, setDisplayName] = useState('');
  const validId = /^[a-f0-9]{24}$/.test(linkId);
  const base = `/guest/${linkId}`;
  const preview = useQuery({ queryKey: ['guest-preview', linkId], queryFn: () => apiFetch<GuestPreviewResponse>(`${base}/view`), enabled: validId && joined && !left, retry: false, staleTime: Infinity, refetchOnWindowFocus: false });
  // This checks authorization only. It does not synchronize configuration edits.
  const status = useQuery({ queryKey: ['guest-access', linkId], queryFn: () => apiFetch(`${base}/status`), enabled: validId && joined && preview.isSuccess && !preview.data?.collaboration && !left, retry: false, refetchInterval: 2000, refetchIntervalInBackground: true, refetchOnWindowFocus: true });
  // Readiness polling updates images only; it never synchronizes layout edits.
  const models = useQuery({ queryKey: ['guest-models', linkId], queryFn: () => apiFetch<{ bins: GuestBinModel[] }>(`${base}/models`), enabled: validId && joined && preview.isSuccess && !preview.data?.collaboration && !left, retry: false,
    refetchInterval: query => query.state.data?.bins?.some(bin => bin.status === 'pending') ? 2000 : false });
  const join = useMutation({
    mutationFn: () => apiFetch(`${base}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret, ...(displayName.trim() ? { displayName: displayName.trim() } : {}) }) }),
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
    <p>Open the shared drawer and its bins. Your organizer controls whether you can view or edit this configuration.</p>
    <p>No account is needed.</p>
    <label className="guest-join-name">Your name (optional)<input maxLength={60} value={displayName} onChange={event => setDisplayName(event.target.value)} autoComplete="nickname" /></label>
    {join.isError && <p role="alert">Could not open the preview. Try again.</p>}
    <button type="button" className="guest-primary" disabled={join.isPending} onClick={() => join.mutate()}>{join.isPending ? 'Opening…' : 'Open preview'}</button>
  </GuestMessage>;
  if (preview.data?.collaboration) return <><LiveEditor base={`${base}/live`} modelBase={base} onExit={() => leave.mutate()} />{leave.isError && <p role="alert">Could not leave. Try again.</p>}</>;
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
