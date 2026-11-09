import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api/apiClient';
import './AdminAuth.css';
import { AdminSession } from '../contexts/AdminSession';

export function AdminAuth({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ['admin-session'], queryFn: () => apiFetch<{ username: string }>('/auth/session'),
    retry: false, refetchInterval: 30_000, refetchOnWindowFocus: true,
  });
  useEffect(() => {
    const expired = () => {
      queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'admin-session' });
      void queryClient.invalidateQueries({ queryKey: ['admin-session'] });
    };
    window.addEventListener('ordinus:auth-required', expired);
    return () => window.removeEventListener('ordinus:auth-required', expired);
  }, [queryClient]);
  if (session.isPending) return <main className="admin-auth"><p role="status">Checking admin session…</p></main>;
  if (session.isError) {
    if (!(session.error instanceof ApiError) || session.error.status !== 401) return <main className="admin-auth"><h1>Ordinus is unavailable</h1><p role="alert">Could not check your session.</p><button onClick={() => void session.refetch()}>Retry</button></main>;
    return <AdminSignIn onSignedIn={() => { void session.refetch(); }} />;
  }
  const signOut = async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    queryClient.clear();
    window.location.reload();
  };
  return <AdminSession.Provider value={{ signOut }}>{children}</AdminSession.Provider>;
}

function AdminSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'request' | 'reset'>('login');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [requestId, setRequestId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      if (mode === 'login') {
        await apiFetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password }) });
        setPassword('');
        onSignedIn();
      } else if (mode === 'request') {
        const issued = await apiFetch<{ requestId: string }>('/auth/reset/request', { method: 'POST' });
        setRequestId(issued.requestId);
        setMode('reset');
      } else {
        if (password !== confirm) throw new Error('Passwords do not match');
        await apiFetch('/auth/reset/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, code, password }) });
        setPassword(''); setConfirm(''); setCode('');
        setMode('login'); setMessage('Password reset. Sign in with your new password.');
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Request failed. Try again.'); }
    finally { setPending(false); }
  }
  return <main className="admin-auth">
    <section className="admin-auth-content" aria-labelledby="admin-title">
      <p className="admin-auth-brand">ORDINUS</p>
      <h1 id="admin-title">{mode === 'login' ? 'Sign in to Ordinus' : 'Reset admin password'}</h1>
      <p>{mode === 'login' ? 'Sign in as admin to open your drawer configurations.' : 'Retrieve your one-time reset code from the server logs. Codes expire after 10 minutes.'}</p>
      {message && <p role="status">{message}</p>}
      {mode === 'reset' && <p>Find reset request <strong>{requestId}</strong> in the server logs.</p>}
      <form onSubmit={event => void submit(event)}>
        {mode === 'login' && <label>Username<input name="username" value="admin" autoComplete="username" readOnly /></label>}
        {mode === 'reset' && <label>Reset code<input value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code" required maxLength={100} /></label>}
        {mode !== 'request' && <label>{mode === 'login' ? 'Password' : 'New password'}<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'reset' ? 12 : undefined} maxLength={256} required /></label>}
        {mode === 'reset' && <><p>Use 12 to 256 characters.</p><label>Confirm password<input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" minLength={12} maxLength={256} required /></label></>}
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="admin-auth-primary" disabled={pending}>{pending ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'request' ? 'Request reset code' : 'Reset password'}</button>
        <button type="button" disabled={pending} onClick={() => { setMode(mode === 'login' ? 'request' : 'login'); setPassword(''); setConfirm(''); setCode(''); setError(''); setMessage(''); }}>{mode === 'login' ? 'Reset admin password' : 'Back to sign in'}</button>
      </form>
    </section>
  </main>;
}
