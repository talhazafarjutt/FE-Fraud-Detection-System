import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Suspense } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { roleLabel } from '@/auth/tokenStore';
import { ErrorBoundary } from './ErrorBoundary';
import { StatusDot } from './StatusDot';
import { Skeleton, cx } from './primitives';

interface NavItem {
  to: string;
  label: string;
  /** Nav items are driven by scope. An item the caller cannot use is absent. */
  scope: string;
}

const NAV: NavItem[] = [
  { to: '/alerts', label: 'Alerts', scope: 'alerts:read' },
  { to: '/transactions', label: 'Transactions', scope: 'transactions:read' },
  { to: '/users', label: 'Users', scope: 'users:manage' },
];

function Wordmark() {
  return (
    <span className="font-display text-[19px] font-extrabold uppercase tracking-tighter text-ink">
      Civitas<span className="text-ultra">AI</span>
    </span>
  );
}

export function AppShell() {
  const { session, hasScope, signOut } = useAuth();
  const navigate = useNavigate();

  // ADMIN has users:manage only — deliberately no alert access. The alerts nav
  // item is therefore absent for an admin, not disabled with a tooltip.
  const items = NAV.filter((item) => hasScope(item.scope));

  const role = roleLabel(session?.scopes ?? []);
  // alerts:read:all is cross-team visibility. Without it the server silently
  // filters to the caller's own team, so saying which team is on screen matters.
  const crossTeam = hasScope('alerts:read:all');

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-rule bg-paper">
        <div className="shell flex flex-wrap items-center gap-x-8 gap-y-4 py-4">
          <Wordmark />

          <nav className="flex items-center gap-6" aria-label="Main">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cx(
                    'font-mono text-[11px] uppercase tracking-label transition-colors',
                    isActive ? 'text-ultra' : 'text-ink-3 hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            {/* Team scoping is implicit server-side; showing it makes it visible. */}
            {crossTeam ? (
              <span className="tag" title="alerts:read:all — alerts from every team are visible">
                All teams
              </span>
            ) : session?.team ? (
              <span className="tag" title="The server filters alerts to this team">
                Team {session.team}
              </span>
            ) : null}
            <span className="tag" title={session?.email ?? undefined}>
              {role}
            </span>
            <StatusDot />
            <button type="button" onClick={handleSignOut} className="btn btn--ghost">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="shell py-10">
        <ErrorBoundary label="Console">
          <Suspense fallback={<RouteSkeleton />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

function RouteSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
