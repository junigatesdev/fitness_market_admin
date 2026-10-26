import { FormEvent, useState } from 'react';
import { LoginErrors, validateLogin } from './validation';

interface LoginPageProps {
  /** Resolve on success; reject with an Error whose message is shown to the user. Real auth is wired in later. */
  onLogin?: (email: string, password: string) => Promise<void>;
}

const notConnected = async () => {
  throw new Error('Sign-in is not connected yet.');
};

export function LoginPage({ onLogin = notConnected }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const found = validateLogin(email, password);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await onLogin(email.trim(), password);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login">
      <form className="card" onSubmit={handleSubmit} noValidate>
        <h1 className="brand">Fitness Market</h1>
        <p className="subtitle">Admin portal</p>

        {formError && <p role="alert" className="form-error">{formError}</p>}

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && <p id="email-error" className="field-error">{errors.email}</p>}

        <label htmlFor="password">Password</label>
        <div className="password">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
          />
          <button type="button" className="link" onClick={() => setShowPassword((s) => !s)}>
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        {errors.password && <p id="password-error" className="field-error">{errors.password}</p>}

        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
