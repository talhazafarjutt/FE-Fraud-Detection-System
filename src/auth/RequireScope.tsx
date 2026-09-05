import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { Button, Eyebrow } from '@/components/primitives';

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

/** Send a freshly-signed-in user to the first screen their scopes allow. */
export function ScopeLanding() {
  const { isAuthenticated, hasScope } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (hasScope('alerts:read')) return <Navigate to="/alerts" replace />;
  if (hasScope('users:manage')) return <Navigate to="/users" replace />;
  return <Navigate to="/login" replace />;
}
