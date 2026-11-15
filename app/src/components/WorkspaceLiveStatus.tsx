import { useWorkspace } from '../contexts/WorkspaceContext';
export function WorkspaceLiveStatus() {
  const { liveSync, isDirty } = useWorkspace();
  if (!liveSync?.enabled) return null;
  return <section className="workspace-live-status" aria-label="Live workspace">
    <p role="status"><strong>{!liveSync.connected ? 'Reconnecting · Local edits are kept' : liveSync.conflict ? 'Live · Review changes' : liveSync.saving || isDirty ? 'Live · Saving workspace…' : 'Live · Saved'}</strong> · Client changes appear here automatically.</p>
    {!!liveSync.participants.length && <p>Connected: {liveSync.participants.join(', ')}</p>}
    {liveSync.problem && <p role="alert">{liveSync.problem}</p>}
    {liveSync.conflict ? <div><p>Keeping your workspace changes replaces the latest shared version. Review the drawer before choosing.</p><button type="button" onClick={liveSync.useLatest}>Use latest shared drawer</button><button type="button" onClick={liveSync.keepLocal}>Keep my workspace changes</button></div>
      : liveSync.problem && <button type="button" disabled={!liveSync.connected} onClick={() => void liveSync.flush().catch(() => {})}>Retry workspace save</button>}
  </section>;
}
