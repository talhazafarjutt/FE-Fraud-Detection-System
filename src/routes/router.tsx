import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { lazyRoute } from './lazyRoute';
import { AppShell } from '@/components/AppShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RequireScope, ScopeLanding } from '@/auth/RequireScope';
import { NotFound } from '@/components/NotFound';

/**
 * Route-level code splitting, every lazy import wrapped by `lazyRoute` so a
 * chunk that fails to load recovers once instead of surfacing as a crashed
 * route. Recharts is imported inside the explanation chart only, so it never
 * lands in the initial bundle.
 *
 * ROUTES ARE DEFINED IN ONE PLACE AND SMOKE-TESTED AS A SET
 * (tests/routes.test.ts mounts every entry here). A route pointing at a file
 * that does not exist used to build cleanly and fail only at runtime — which
 * is exactly how the audit screen shipped broken.
 */
const LoginPage = lazyRoute('LoginPage', () => import('@/features/auth/LoginPage'));
const FlowPage = lazyRoute('FlowPage', () => import('@/features/flow/FlowPage'));
const DashboardPage = lazyRoute('DashboardPage', () => import('@/features/dashboard/DashboardPage'));
const AlertQueuePage = lazyRoute('AlertQueuePage', () => import('@/features/alerts/AlertQueuePage'));
const AlertDetailPage = lazyRoute('AlertDetailPage', () => import('@/features/alerts/AlertDetailPage'));
const TransactionListPage = lazyRoute('TransactionListPage', () => import('@/features/transactions/TransactionListPage'));
const TransactionSubmitPage = lazyRoute('TransactionSubmitPage', () => import('@/features/transactions/TransactionsPage'));
const UsersPage = lazyRoute('UsersPage', () => import('@/features/users/UsersPage'));

// The investigation layer — /v1/cases and friends, live on the local API.
const CasesPage = lazyRoute('CasesPage', () => import('@/features/cases/CasesPage'));
const CaseDetailPage = lazyRoute('CaseDetailPage', () => import('@/features/cases/CaseDetailPage'));
const InvestigationsPage = lazyRoute('InvestigationsPage', () => import('@/features/cases/InvestigationsPage'));

// Entities, network and audit. These were stubs; all three endpoints exist.
const EntitiesPage = lazyRoute('EntitiesPage', () => import('@/features/entities/EntitiesPage'));
const EntityDetailPage = lazyRoute('EntityDetailPage', () => import('@/features/entities/EntityDetailPage'));
const NetworkExplorerPage = lazyRoute('NetworkExplorerPage', () => import('@/features/network/NetworkExplorerPage'));
const AuditLogPage = lazyRoute('AuditLogPage', () => import('@/features/audit/AuditLogPage'));

const simulatorEnabled = import.meta.env.VITE_ENABLE_SIMULATOR === 'true';

/**
 * The simulator's `import()` sits inside this branch on purpose. A top-level
 * `lazy(() => import(...))` would keep the module reachable and the bundler
 * would still emit its chunk even when the flag is off. Written this way, the
 * whole screen is absent from a production build rather than merely unrouted.
 */
const SimulatorPage = simulatorEnabled
  ? lazy(() => import('@/features/simulator/SimulatorPage'))
  : null;

export interface RouteSpec {
  path: string;
  element: React.ReactNode;
}

function guarded(scope: string | string[], element: React.ReactNode, label: string) {
  return (
    <RequireScope scope={scope}>
      <ErrorBoundary label={label}>{element}</ErrorBoundary>
    </RequireScope>
  );
}

/**
 * Every child route of the shell, exported so a smoke test can mount all of
 * them. Keeping the list and the router the same object is what makes that
 * test meaningful — a route added here is covered automatically.
 */
export const APP_ROUTES: RouteSpec[] = [
  { path: 'flow', element: guarded([], <FlowPage />, 'Workflow') },
  { path: 'dashboard', element: guarded('alerts:read', <DashboardPage />, 'Dashboard') },
  { path: 'alerts', element: guarded('alerts:read', <AlertQueuePage />, 'Alert queue') },
  { path: 'alerts/:alertId', element: guarded('alerts:read', <AlertDetailPage />, 'Alert') },
  { path: 'transactions', element: guarded('transactions:read', <TransactionListPage />, 'Transactions') },
  {
    path: 'transactions/submit',
    element: guarded('transactions:read', <TransactionSubmitPage />, 'Submit a transaction'),
  },
  { path: 'investigations', element: guarded('alerts:read', <InvestigationsPage />, 'Investigations') },
  { path: 'cases', element: guarded('alerts:read', <CasesPage />, 'Cases') },
  { path: 'cases/:caseId', element: guarded('alerts:read', <CaseDetailPage />, 'Case') },
  { path: 'network', element: guarded('alerts:read', <NetworkExplorerPage />, 'Network explorer') },
  { path: 'entities', element: guarded('entities:read', <EntitiesPage />, 'Entities') },
  { path: 'entities/:partyId', element: guarded('entities:read', <EntityDetailPage />, 'Entity') },
  // audit:read is held by SUPERVISOR and ADMIN only; an ANALYST gets 403 here
  // and the nav item is absent for them entirely.
  { path: 'audit', element: guarded('audit:read', <AuditLogPage />, 'Audit log') },
  { path: 'users', element: guarded('users:manage', <UsersPage />, 'User administration') },
  // Tree-shaken out entirely unless the env flag is on at build time.
  ...(SimulatorPage ? [{ path: 'simulator', element: guarded([], <SimulatorPage />, 'Simulator') }] : []),
];

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <ScopeLanding /> },
      ...APP_ROUTES,
      { path: '*', element: <NotFound /> },
    ],
  },
]);
