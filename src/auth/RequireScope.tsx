import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { Button, Eyebrow } from '@/components/primitives';
import { shouldShowIntro } from '@/features/flow/introState';

/**
 * Route guard. This is UX, not security — the server is the authority and every
 * call still handles a 403/404 coming back anyway.
 */
export function RequireScope({
  scope,
  children,
}: {
  scope?: string | string[];
  children: ReactNode;
}) {
  const { isAuthenticated, hasScope } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const required = scope === undefined ? [] : Array.isArray(scope) ? scope : [scope];
  const permitted = required.length === 0 || required.some(hasScope);

  if (!permitted) {
    return (
      <div className="border border-rule bg-surface p-8">
        <Eyebrow>Not available to this account</Eyebrow>
        <h2 className="mb-3">This section is outside your permissions.</h2>
        <p className="mb-6 max-w-xl text-ink-2">
          Your account does not carry the scope this screen requires. Permissions are granted per
          role by an administrator.
        </p>
        <Button variant="ghost" onClick={() => window.history.back()}>
          Go back
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Send a freshly-signed-in user to the first screen their scopes allow.
 *
 * The very first arrival goes to the workflow view instead, once per sign-in.
 * A new user otherwise lands on a wall of nav items and numbers with nothing
 * saying what a case is or which step belongs to them — and this is the one
 * moment they are guaranteed to pass through, whatever their role. An ADMIN
 * never reaches the dashboard at all, so hanging it off there would have
 * skipped exactly the person with the least obvious job.
 */
export function ScopeLanding() {
  const { isAuthenticated, hasScope, session } = useAuth();

  const landing = hasScope('alerts:read')
    ? '/dashboard'
    : hasScope('users:manage')
      ? '/users'
      : hasScope('audit:read')
        ? '/audit'
        : null;

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (shouldShowIntro(session?.subject ?? null)) return <Navigate to="/flow" replace />;
  if (landing) return <Navigate to={landing} replace />;
  return <Navigate to="/flow" replace />;
}
