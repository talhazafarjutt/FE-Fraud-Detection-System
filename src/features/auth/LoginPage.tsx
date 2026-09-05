import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { type LoginInput, loginSchema } from '@/api/schemas/auth';
import { ApiError } from '@/lib/problem';
import { Button, Eyebrow } from '@/components/primitives';
import { StatusDot } from '@/components/StatusDot';

/** Local seed accounts. Rendered only in dev; all data is synthetic. */
const DEMO_ACCOUNTS = [
  { email: 'analyst@example.com', team: 'team-alpha', role: 'ANALYST' },
  { email: 'supervisor@example.com', team: 'team-alpha', role: 'SUPERVISOR' },
  { email: 'other-analyst@example.com', team: 'team-beta', role: 'ANALYST' },
  { email: 'admin@example.com', team: 'default', role: 'ADMIN' },
] as const;
const DEMO_PASSWORD = 'SyntheticDemo!2026';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setLockoutSeconds(null);
    try {
      const session = await signIn(values);
      // Route by scope, not by role name — the backend authorises on scopes.
      if (session.scopes.includes('alerts:read')) {
        navigate('/alerts', { replace: true });
      } else if (session.scopes.includes('users:manage')) {
        navigate('/users', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (error) {
      if (error instanceof ApiError) {
        // 429 carries Retry-After. Say so honestly rather than "try again later".
        if (error.status === 429 && error.problem.retryAfter !== undefined) {
          setLockoutSeconds(error.problem.retryAfter);
        }
        setFormError(error.problem.detail || error.problem.title);
        return;
      }
      setFormError('Could not reach the platform. Check that the API is running.');
    }
  });

  const fillDemo = (email: string) => {
    setValue('username', email, { shouldValidate: true });
    setValue('password', DEMO_PASSWORD, { shouldValidate: true });
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-rule">
        <div className="shell flex items-center justify-between py-4">
          <span className="font-display text-[19px] font-extrabold uppercase tracking-tighter">
            Civitas<span className="text-ultra">AI</span>
          </span>
          <StatusDot />
        </div>
      </header>

      <main className="shell grid gap-16 py-16 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="max-w-xl">
          <Eyebrow>Fraud intelligence console</Eyebrow>
          <h1 className="mb-6">Your systems see transactions. We see the network behind them.</h1>
          <p className="text-[17px] leading-relaxed text-ink-2">
            Every transaction is scored on arrival. Scores above the review threshold raise a case,
            an analyst triages it, and a supervisor closes it. Each step is recorded against the
            person who took it.
          </p>

          <dl className="mt-12 grid gap-px border border-rule bg-rule sm:grid-cols-3">
            {[
              ['Scored on arrival', 'Every transaction, before it settles'],
              ['Explained', 'Feature contributions on every decision'],
              ['Audited', 'Actor and timestamp on every state change'],
            ].map(([term, detail]) => (
              <div key={term} className="bg-surface p-5">
                <dt className="mono-label mb-2 text-ink-3">{term}</dt>
                <dd className="text-[14px] text-ink-2">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border border-rule bg-surface p-8">
          <Eyebrow>Sign in</Eyebrow>

          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="username" className="mono-label mb-2 block text-ink-3">
                Email
              </label>
              <input
                id="username"
                type="email"
                autoComplete="username"
                className="field"
                aria-invalid={errors.username ? 'true' : 'false'}
                {...register('username')}
              />
              {errors.username ? (
                <p className="mt-2 font-mono text-[11px] uppercase tracking-tag text-carmine">
                  {errors.username.message}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="password" className="mono-label mb-2 block text-ink-3">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="field"
                aria-invalid={errors.password ? 'true' : 'false'}
                {...register('password')}
              />
              {errors.password ? (
                <p className="mt-2 font-mono text-[11px] uppercase tracking-tag text-carmine">
                  {errors.password.message}
                </p>
              ) : null}
            </div>

            {formError ? (
              <div className="border border-carmine px-4 py-3">
                <p className="mono-label text-carmine">Sign-in failed</p>
                <p className="mt-2 text-[14px] text-ink-2">
                  {lockoutSeconds !== null
                    ? `Too many attempts. Try again in ${lockoutSeconds} seconds.`
                    : formError}
                </p>
              </div>
            ) : null}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Signing in' : 'Sign in'}
            </Button>
          </form>

          {/*
            Demo accounts are dev-only. There are no client_id/client_secret
            fields on this page: the machine flow lives on the Simulator screen
            and mixing the two has caused repeated confusion in this project.
          */}
          {import.meta.env.DEV ? (
            <div className="mt-8 border-t border-rule-soft pt-6">
              <button
                type="button"
                onClick={() => setShowDemo((v) => !v)}
                className="mono-label text-ink-3 hover:text-ink"
                aria-expanded={showDemo}
              >
                {showDemo ? '- ' : '+ '}Demo accounts
              </button>
              {showDemo ? (
                <>
                  <ul className="mt-4 space-y-px bg-rule">
                    {DEMO_ACCOUNTS.map((account) => (
                      <li key={account.email}>
                        <button
                          type="button"
                          onClick={() => fillDemo(account.email)}
                          className="flex w-full items-center justify-between gap-4 bg-surface px-3 py-2 text-left hover:bg-paper"
                        >
                          <span className="font-mono text-[11px] text-ink-2">{account.email}</span>
                          <span className="font-mono text-[10px] uppercase tracking-tag text-ink-3">
                            {account.role} · {account.team}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[13px] text-ink-3">All data is synthetic.</p>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
