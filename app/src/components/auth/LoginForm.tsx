import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface LoginFormProps {
  onSwitchToRegister: () => void;
  onSuccess: () => void;
}

export function LoginForm({ onSwitchToRegister, onSuccess }: LoginFormProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={isSubmitting}
        />
      </div>
      <div className="form-group">
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          disabled={isSubmitting}
        />
      </div>
      {error && <div className="auth-error">{error}</div>}
      <button
        type="submit"
        className="auth-submit-button"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Logging in...' : 'Log In'}
      </button>
      <p className="auth-switch">
        Don't have an account?{' '}
        <button
          type="button"
          className="auth-switch-link"
          onClick={onSwitchToRegister}
        >
          Register
        </button>
      </p>
    </form>
  );
}
