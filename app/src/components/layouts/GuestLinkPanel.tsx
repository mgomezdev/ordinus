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
  const [allowEdit, setAllowEdit] = useState(false);
  const [libraryIds, setLibraryIds] = useState<string[]>(['bins_standard']);
  const libraries = useQuery({ queryKey: ['share-libraries'], queryFn: () => apiFetch<{ data: { id: string; name: string }[] }>('/libraries'), enabled: allowEdit });
  const [newLink, setNewLink] = useState<{ id: string; url: string; allowEdit: boolean } | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const queryClient = useQueryClient();
  const queryKey = ['guest-links', layoutId];
  const path = `/layouts/${layoutId}/guest-links`;
  const links = useQuery({ queryKey, queryFn: () => apiFetch<{ data: GuestLink[] }>(path), refetchInterval: 30_000 });
  const create = useMutation({
    mutationFn: async () => {
      await beforeCreate?.();
      return apiFetch<GuestLink & { secret: string }>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresInHours: hours, ...(allowEdit ? { allowEdit, libraryIds } : {}) }) });
    },
    onSuccess: link => {
      const { secret, ...metadata } = link;
      queryClient.setQueryData<{ data: GuestLink[] }>(queryKey, old => ({ data: [metadata, ...(old?.data ?? [])] }));
      setNewLink({ id: link.id, url: `${window.location.origin}/guest/${link.id}#${secret}`, allowEdit: !!link.allowEdit });
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
    <h3>{allowEdit ? 'Live collaboration' : 'Share a read-only preview'}</h3>
    <p>{beforeCreate ? 'Your current drawer and attached photos are saved before a link is created.' : 'Clients can view this saved drawer and its attached photos. Save workspace changes before sharing.'}</p>
    <label className="share-edit-choice"><input type="checkbox" checked={allowEdit} disabled={create.isPending} onChange={event => setAllowEdit(event.target.checked)} /> Allow client editing (live)</label>
    <p>{allowEdit ? 'Anyone with this link can edit this drawer until access closes. Client access is limited to this configuration and the approved bin libraries.' : 'Anyone with the link can view this configuration until access closes. This preview does not allow editing.'}</p>
    {allowEdit && <fieldset className="share-libraries" disabled={create.isPending || libraries.isPending}><legend>Approved bin libraries</legend><p>Choose one or more libraries for this session.</p>{libraries.data?.data.map(library => <label key={library.id}><input type="checkbox" checked={libraryIds.includes(library.id)} onChange={event => setLibraryIds(previous => event.target.checked ? [...previous, library.id] : previous.filter(id => id !== library.id))} />{library.name}</label>)}</fieldset>}
    {allowEdit && libraries.isError && <p role="alert">Could not load bin libraries. <button type="button" onClick={() => void libraries.refetch()}>Retry</button></p>}
    <label>Link expires after<select value={hours} onChange={event => setHours(Number(event.target.value))} disabled={create.isPending}>
      <option value={1}>1 hour</option><option value={24}>24 hours</option><option value={168}>7 days</option>
    </select></label>
    <button type="button" className="saved-config-btn" disabled={create.isPending || (allowEdit && (!libraryIds.length || libraryIds.some(id => !libraries.data?.data.some(library => library.id === id))))} onClick={() => create.mutate()}>{create.isPending ? 'Creating…' : allowEdit ? 'Create collaboration link' : 'Create preview link'}</button>
    {newLink && <div className="guest-link-result">
      <label>Preview link<input readOnly value={newLink.url} onFocus={event => event.target.select()} /></label>
      <div className="guest-link-actions"><button className="saved-config-btn" type="button" onClick={() => void copy()}>Copy link</button><a href={newLink.url} target="_blank" rel="noreferrer">Open preview</a></div>
      <p>This link is shown once. Use a private browser window to test the client view.</p>
    </div>}
    {copyStatus && <p role="status">{copyStatus}</p>}
    {(newLink?.allowEdit || links.data?.data.some(link => link.allowEdit)) && <p>{!beforeCreate && <a className="saved-config-btn" href={`/?layout=${layoutId}`}>Open workspace</a>}<span> Keep editing in Workspace. Client changes appear there automatically, and your changes are shared as you work.</span></p>}
    {(create.isError || close.isError) && <p role="alert">{(create.error ?? close.error)?.message ?? 'Could not update preview access. Try again.'}</p>}
    {links.isPending && <p role="status">Loading preview links…</p>}
    {links.isError && <p role="alert">Could not load preview links. <button type="button" onClick={() => void links.refetch()}>Retry</button></p>}
    {!!links.data?.data.length && <ul className="guest-link-list">{links.data.data.map(link => {
      const expired = Date.parse(link.expiresAt) <= links.dataUpdatedAt;
      const active = !link.revokedAt && !expired;
      return <li key={link.id}>
        <span>{link.revokedAt ? 'Closed' : expired ? 'Expired' : 'Active'} · {link.allowEdit ? 'Live editing' : 'Read-only'} · Expires {new Date(link.expiresAt).toLocaleString()}</span>
        {active && <button className="saved-config-btn" type="button" disabled={close.isPending} onClick={() => close.mutate(link.id)}>Close access</button>}
      </li>;
    })}</ul>}
  </section>;
}
