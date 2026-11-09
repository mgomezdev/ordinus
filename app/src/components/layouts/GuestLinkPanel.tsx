import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GuestLink } from '@gridfinity/shared';
import { apiFetch } from '../../api/apiClient';
import './GuestLinkPanel.css';

interface GuestLinkPanelProps {
  layoutId: number;
  name: string;
  beforeCreate?: () => Promise<void>;
}

export function GuestLinkPanel({ layoutId, name, beforeCreate }: GuestLinkPanelProps) {
  const [hours, setHours] = useState(24);
  const [newLink, setNewLink] = useState<{ id: string; url: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const queryClient = useQueryClient();
  const queryKey = ['guest-links', layoutId];
  const path = `/layouts/${layoutId}/guest-links`;
  const links = useQuery({ queryKey, queryFn: () => apiFetch<{ data: GuestLink[] }>(path), refetchInterval: 30_000 });
  const create = useMutation({
    mutationFn: async () => {
      await beforeCreate?.();
      return apiFetch<GuestLink & { secret: string }>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresInHours: hours }) });
    },
    onSuccess: link => {
      const { secret, ...metadata } = link;
      queryClient.setQueryData<{ data: GuestLink[] }>(queryKey, old => ({ data: [metadata, ...(old?.data ?? [])] }));
      setNewLink({ id: link.id, url: `${window.location.origin}/guest/${link.id}#${secret}` });
      setCopyStatus('');
    },
  });
  const close = useMutation({
    mutationFn: (id: string) => apiFetch(`${path}/${id}`, { method: 'DELETE' }),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<{ data: GuestLink[] }>(queryKey, old => ({ data: (old?.data ?? []).map(link => link.id === id ? { ...link, revokedAt: new Date().toISOString() } : link) }));
      if (newLink?.id === id) { setNewLink(null); setCopyStatus('Access closed.'); }
    },
  });
  async function copy() {
    if (!newLink) return;
    try { await navigator.clipboard.writeText(newLink.url); setCopyStatus('Link copied.'); }
    catch { setCopyStatus('Copy is unavailable. Select and copy the link above.'); }
  }
  return <section className="guest-link-panel" aria-label={`Preview access for ${name}`}>
    <h3>Share a read-only preview</h3>
    <p>{beforeCreate ? 'Your current drawer and attached photos are saved before a link is created.' : 'Clients can view this saved drawer and its attached photos. Save workspace changes before sharing.'}</p>
    <p>Anyone with the link can view this configuration until access closes. This preview does not allow editing.</p>
    <label>Link expires after<select value={hours} onChange={event => setHours(Number(event.target.value))} disabled={create.isPending}>
      <option value={1}>1 hour</option><option value={24}>24 hours</option><option value={168}>7 days</option>
    </select></label>
    <button type="button" className="saved-config-btn" disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Creating…' : 'Create preview link'}</button>
    {newLink && <div className="guest-link-result">
      <label>Preview link<input readOnly value={newLink.url} onFocus={event => event.target.select()} /></label>
      <div className="guest-link-actions"><button className="saved-config-btn" type="button" onClick={() => void copy()}>Copy link</button><a href={newLink.url} target="_blank" rel="noreferrer">Open preview</a></div>
      <p>This link is shown once. Use a private browser window to test the client view.</p>
    </div>}
    {copyStatus && <p role="status">{copyStatus}</p>}
    {(create.isError || close.isError) && <p role="alert">{(create.error ?? close.error)?.message ?? 'Could not update preview access. Try again.'}</p>}
    {links.isPending && <p role="status">Loading preview links…</p>}
    {links.isError && <p role="alert">Could not load preview links. <button type="button" onClick={() => void links.refetch()}>Retry</button></p>}
    {!!links.data?.data.length && <ul className="guest-link-list">{links.data.data.map(link => {
      const expired = Date.parse(link.expiresAt) <= links.dataUpdatedAt;
      const active = !link.revokedAt && !expired;
      return <li key={link.id}>
        <span>{link.revokedAt ? 'Closed' : expired ? 'Expired' : 'Active'} · Expires {new Date(link.expiresAt).toLocaleString()}</span>
        {active && <button className="saved-config-btn" type="button" disabled={close.isPending} onClick={() => close.mutate(link.id)}>Close access</button>}
      </li>;
    })}</ul>}
  </section>;
}
