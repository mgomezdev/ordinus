import { useState } from 'react';
import { useUploadUserStlMutation } from '../hooks/useUserStls';

interface UserStlUploadModalProps {
  onClose: () => void;
}

export function UserStlUploadModal({ onClose }: UserStlUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useUploadUserStlMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name) {
      setName(f.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) { setError('Please select a file.'); return; }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'stl' && ext !== '3mf') {
      setError('Only .stl and .3mf files are supported.');
      return;
    }
    if (!name.trim()) { setError('Please enter a name.'); return; }
    try {
      await mutateAsync({ file, name: name.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Upload Model</h2>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="form-field">
            <label htmlFor="stl-file">File (.stl or .3mf)</label>
            <input
              id="stl-file"
              type="file"
              accept=".stl,.3mf"
              onChange={handleFileChange}
            />
          </div>
          <div className="form-field">
            <label htmlFor="stl-name">Name</label>
            <input
              id="stl-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error && <div role="alert" className="upload-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={isPending}>Cancel</button>
            <button type="submit" disabled={isPending}>
              {isPending ? 'Uploading\u2026' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
