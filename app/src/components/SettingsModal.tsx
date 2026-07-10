import { useState } from 'react';
import { useSettings } from '../contexts/SettingsContext.js';
import type { ServiceStatus } from '../api/settings.api.js';

function StatusDot({ status }: { status: ServiceStatus }) {
  const color = status === 'up' ? 'var(--valid-primary, #22c55e)' : status === 'down' ? 'var(--invalid-primary, #ef4444)' : 'var(--text-tertiary, #9ca3af)';
  const label = status === 'up' ? 'Up' : status === 'down' ? 'Down' : 'Not configured';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, health, saveSettings } = useSettings();
  const [themisUrl, setThemisUrl] = useState(settings.themis_url);
  const [laminusUrl, setLaminusUrl] = useState(settings.laminus_url);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveSettings({ themis_url: themisUrl, laminus_url: laminusUrl });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="confirm-dialog-overlay"
      onClick={onClose}
    >
      <div
        className="confirm-dialog"
        style={{ maxWidth: 440 }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="confirm-dialog-title">Service Settings</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Themis URL</label>
              <StatusDot status={health.themis} />
            </div>
            <input
              type="url"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '7px 10px', borderRadius: 6,
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                fontSize: 13, fontFamily: 'var(--font-body)',
              }}
              placeholder="http://localhost:8000"
              value={themisUrl}
              onChange={e => setThemisUrl(e.target.value)}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Laminus URL</label>
              <StatusDot status={health.laminus} />
            </div>
            <input
              type="url"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '7px 10px', borderRadius: 6,
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                fontSize: 13, fontFamily: 'var(--font-body)',
              }}
              placeholder="http://localhost:5000"
              value={laminusUrl}
              onChange={e => setLaminusUrl(e.target.value)}
            />
          </div>

          {error && <div style={{ fontSize: 12, color: 'var(--invalid-primary)' }}>{error}</div>}
        </div>

        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-btn confirm-dialog-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="confirm-dialog-btn confirm-dialog-confirm"
            onClick={() => { void handleSave(); }}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
