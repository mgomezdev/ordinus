import { useState } from 'react';
import { useUploadUserStlMutation } from '../hooks/useUserStls';

interface UserStlUploadModalProps {
  onClose: () => void;
}

export function UserStlUploadModal({ onClose }: UserStlUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [gridX, setGridX] = useState(1);
  const [gridY, setGridY] = useState(1);
  const [gridZ, setGridZ] = useState(3);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useUploadUserStlMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) { setError('Please select a file.'); return; }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'stl') { setError('Only .stl files are supported.'); return; }
    if (!name.trim()) { setError('Please enter a name.'); return; }
    try {
      await mutateAsync({ file, name: name.trim(), opts: { gridX, gridY, gridZ, visibility } });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  const numInput = (label: string, value: number, onChange: (v: number) => void, min = 1, max = 10) => (
    <div className="form-field">
      <label>{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min)))}
      />
    </div>
  );

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Upload Model</h2>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="form-field">
            <label htmlFor="stl-file">File (.stl)</label>
            <input id="stl-file" type="file" accept=".stl" onChange={handleFileChange} />
          </div>
          <div className="form-field">
            <label htmlFor="stl-name">Name</label>
            <input id="stl-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {numInput('Width (grid units)', gridX, setGridX)}
          {numInput('Depth (grid units)', gridY, setGridY)}
          {numInput('Height (height units)', gridZ, setGridZ)}
          <div className="form-field">
            <label>Visibility</label>
            <div className="radio-group">
              <label>
                <input type="radio" name="visibility" value="private" checked={visibility === 'private'}
                  onChange={() => setVisibility('private')} /> Private (only you)
              </label>
              <label>
                <input type="radio" name="visibility" value="public" checked={visibility === 'public'}
                  onChange={() => setVisibility('public')} /> Public (community library)
              </label>
            </div>
            {visibility === 'public' && (
              <p className="upload-hint">Dimensions will be verified against the STL file (±5mm tolerance).</p>
            )}
          </div>
          {error && <div role="alert" className="upload-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={isPending}>Cancel</button>
            <button type="submit" disabled={isPending}>
              {isPending ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
