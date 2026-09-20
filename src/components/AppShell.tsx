import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Suspense } from 'react';
import { API_BASE_LABEL, API_BASE_PROBLEM } from '@/api/client';
import { teamLabel } from '@/lib/format';
import { useAuth } from '@/auth/AuthProvider';
import { roleLabel } from '@/auth/tokenStore';
import { ErrorBoundary } from './ErrorBoundary';
import { StatusDot } from './StatusDot';
import { ThemeToggle } from './ThemeToggle';
import { Skeleton, cx } from './primitives';

interface NavItem {
  to: string;
  label: string;
  /**
   * Nav items are driven by SCOPE, never by a role name. An item the caller
   * cannot use is absent rather than present-and-403 — letting someone click
   * into a permissions error is worse than not offering it.
   */
  scope: string;
}

/**
 * The nine sections, in the order a case actually moves: a transaction is
 * detected, raises an alert, is grouped into an investigation, and ends as a
 * concluded case with an audit trail behind it.
 *
 * Nothing here is a stub. Every entry reads from its own endpoint.
 */
const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', scope: 'alerts:read' },
  { to: '/alerts', label: 'Alerts', scope: 'alerts:read' },
  { to: '/investigations', label: 'Investigations', scope: 'alerts:read' },
  { to: '/network', label: 'Network', scope: 'alerts:read' },
  { to: '/entities', label: 'Entities', scope: 'entities:read' },
  { to: '/transactions', label: 'Transactions', scope: 'transactions:read' },
  { to: '/cases', label: 'Cases', scope: 'alerts:read' },
  // The trail describes the analysts, so they do not get to read it.
  { to: '/audit', label: 'Audit', scope: 'audit:read' },
  { to: '/users', label: 'Users', scope: 'users:manage' },
];

const MOCKS_ON = import.meta.env.VITE_USE_MSW === 'true';

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

  // ADMIN holds users:manage and audit:read only — deliberately no case access.
  // The alerts nav item is therefore absent for an admin, not disabled.
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
      {/*
        Mock data that nobody notices is worse than an outage, because an
        outage gets reported. If MSW is on, the console says so at the top of
        every screen and does not let it be dismissed.
      */}
      {MOCKS_ON ? (
        <div className="bg-carmine px-4 py-2 text-center font-mono text-[11px] uppercase tracking-label text-on-carmine">
          Demo mode — every response on this screen is mock data, not a real backend
        </div>
      ) : null}

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
              <span className="tag" title="The server filters your results to this team">
                {teamLabel(session.team)}
              </span>
            ) : null}
            <span className="tag" title={session?.email ?? undefined}>
              {role}
            </span>
            <Link
              to="/flow"
              className="tag hover:border-ultra hover:text-ultra"
              title="How money becomes a case, and which part of it is yours"
            >
              Your workflow
            </Link>
            <StatusDot />
            <ThemeToggle />
            <button type="button" onClick={handleSignOut} className="btn btn--ghost">
              Sign out
            </button>
          </div>
        </div>
        <BaseUrlBadge />
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

/**
 * The resolved API base URL, printed where a human can see it.
 *
 * Roughly half of "the console is broken" turns out to be a build pointed at
 * the wrong backend, and nothing on screen said so.
 */
function BaseUrlBadge() {
  if (API_BASE_PROBLEM !== null) {
    return (
      <p className="shell py-2 font-mono text-[11px] text-carmine">
        API not configured — VITE_API_BASE_URL is unset, so every request will fail. Nothing on
        this screen is live.
      </p>
    );
  }
  return (
    <p className="shell py-2 font-mono text-[11px] text-ink-3">
      API <span className="text-ink-2">{API_BASE_LABEL}</span>
    </p>
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
