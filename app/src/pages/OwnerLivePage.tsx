import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { LiveEditor } from '../components/guest/LiveEditor';
export function OwnerLivePage() {
  const { layoutId } = useParams();
  const navigate = useNavigate();
  const { loadLayout } = useWorkspace();
  const [error, setError] = useState('');
  if (!layoutId || !/^\d+$/.test(layoutId)) return <p role="alert">Invalid shared configuration.</p>;
  const exit = async () => {
    try { await loadLayout(Number(layoutId)); navigate('/'); }
    catch { setError('Could not load the latest drawer. Try returning to the workspace again.'); }
  };
  return <div className="owner-live-page">{error && <p role="alert">{error}</p>}<LiveEditor key={layoutId} owner base={`/layouts/${layoutId}/live`} onExit={() => void exit()} /></div>;
}
