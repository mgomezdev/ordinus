import { useState } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useCustomers } from '../../contexts/CustomerContext';
import { useSaveLayoutMutation, useUpdateLayoutMutation } from '../../hooks/useLayouts';
import { buildPayload } from '../../utils/layoutHelpers';
import { GuestLinkPanel } from './GuestLinkPanel';
import './WorkspaceShare.css';

export function WorkspaceShare() {
  const ws = useWorkspace();
  const { selectedCustomer } = useCustomers();
  const create = useSaveLayoutMutation();
  const update = useUpdateLayoutMutation();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true); setError('');
    try {
      const payload = buildPayload(
        ws.layoutMeta.id ? ws.layoutMeta.name : name, ws.layoutMeta.description,
        ws.gridResult.gridX, ws.gridResult.gridY, ws.drawerWidth, ws.drawerDepth,
        ws.spacerConfig, ws.placedItems, ws.refImagePlacements,
        ws.layoutMeta.id ? undefined : selectedCustomer?.id,
      );
      // Explicitly save an empty list too, so removing the last photo is saved.
      const data = { ...payload, refImagePlacements: payload.refImagePlacements ?? [], ...(ws.layoutMeta.revision !== undefined ? { baseRevision: ws.layoutMeta.revision } : {}) };
      const result = ws.layoutMeta.id
        ? await update.mutateAsync({ id: ws.layoutMeta.id, data })
        : await create.mutateAsync(data);
      ws.handleSaveComplete(result.id, result.name, result.revision);
    } catch (err) {
      setError('Could not save the configuration. No new preview link was created. Try again.');
      throw err;
    } finally { setSaving(false); }
  }
  async function openSharing() {
    try { await save(); setNaming(false); setOpen(true); }
    catch { /* Keep the workspace and retry action available. */ }
  }
  return <section className="workspace-sharing" aria-label="Share workspace">
    <div className="workspace-share-actions">
      <button type="button" className="layout-toolbar-btn" disabled={saving} aria-expanded={open || naming} onClick={() => {
        if (open || naming) { setOpen(false); setNaming(false); setError(''); }
        else if (!ws.layoutMeta.id) setNaming(true);
        else void openSharing();
      }}>{saving ? 'Saving…' : open || naming ? 'Hide preview access' : 'Share preview'}</button>
      <span>Changes are saved before sharing.</span>
    </div>
    {error && <p role="alert" className="workspace-share-error">{error}</p>}
    {naming && <form className="workspace-share-name" onSubmit={event => { event.preventDefault(); if (name.trim()) void openSharing(); }}>
      <label>Configuration name<input required maxLength={100} value={name} disabled={saving} onChange={event => setName(event.target.value)} /></label>
      <button type="submit" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save and continue'}</button>
    </form>}
    {open && ws.layoutMeta.id && <div className="workspace-share-panel"><GuestLinkPanel layoutId={ws.layoutMeta.id} name={ws.layoutMeta.name} beforeCreate={save} /></div>}
  </section>;
}
