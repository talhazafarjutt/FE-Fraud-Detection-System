import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RequireScope, ScopeLanding } from '@/auth/RequireScope';
import { NotFound } from '@/components/NotFound';

// Route-level code splitting. Recharts is imported inside the explanation
// chart only, so it never lands in the initial bundle.
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const AlertQueuePage = lazy(() => import('@/features/alerts/AlertQueuePage'));
const AlertDetailPage = lazy(() => import('@/features/alerts/AlertDetailPage'));
const TransactionListPage = lazy(() => import('@/features/transactions/TransactionListPage'));
const TransactionSubmitPage = lazy(() => import('@/features/transactions/TransactionsPage'));
const UsersPage = lazy(() => import('@/features/users/UsersPage'));

// The investigation layer. /v1/cases is not deployed, so these render the
// pending panel — see src/api/unavailable.ts.
const CasesPage = lazy(() => import('@/features/cases/CasesPage'));
const InvestigationsPage = lazy(() => import('@/features/cases/InvestigationsPage'));

// §3 stubs: no endpoint exists for any of these.
const EntitiesPage = lazy(() => import('@/features/stubs/EntitiesPage'));
const NetworkExplorerPage = lazy(() => import('@/features/stubs/NetworkExplorerPage'));
const AuditLogPage = lazy(() => import('@/features/stubs/AuditLogPage'));

const simulatorEnabled = import.meta.env.VITE_ENABLE_SIMULATOR === 'true';

/**
 * The simulator's `import()` sits inside this branch on purpose. A top-level
 * `lazy(() => import(...))` would keep the module reachable and Rollup would
 * still emit its chunk even when the flag is off. Written this way, the whole
 * screen is absent from a production build rather than merely unrouted.
 */
const SimulatorPage = simulatorEnabled
  ? lazy(() => import('@/features/simulator/SimulatorPage'))
  : null;

function guarded(scope: string | string[], element: React.ReactNode, label: string) {
  return (
    <RequireScope scope={scope}>
      <ErrorBoundary label={label}>{element}</ErrorBoundary>
    </RequireScope>
  );
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <ScopeLanding /> },
      { path: 'dashboard', element: guarded('alerts:read', <DashboardPage />, 'Dashboard') },
      { path: 'alerts', element: guarded('alerts:read', <AlertQueuePage />, 'Alert queue') },
      { path: 'alerts/:alertId', element: guarded('alerts:read', <AlertDetailPage />, 'Alert') },
      {
        path: 'transactions',
        element: guarded('transactions:read', <TransactionListPage />, 'Transactions'),
      },
      {
        path: 'transactions/submit',
        element: guarded('transactions:read', <TransactionSubmitPage />, 'Submit a transaction'),
      },
      { path: 'investigations', element: guarded('alerts:read', <InvestigationsPage />, 'Investigations') },
      { path: 'cases', element: guarded('alerts:read', <CasesPage />, 'Cases') },
      { path: 'network', element: guarded('alerts:read', <NetworkExplorerPage />, 'Network explorer') },
      { path: 'entities', element: guarded('alerts:read', <EntitiesPage />, 'Entities') },
      { path: 'audit', element: guarded('alerts:read', <AuditLogPage />, 'Audit log') },
      { path: 'users', element: guarded('users:manage', <UsersPage />, 'User administration') },
      // Tree-shaken out entirely unless the env flag is on at build time.
      ...(SimulatorPage
        ? [{ path: 'simulator', element: guarded([], <SimulatorPage />, 'Simulator') }]
        : []),
      { path: '*', element: <NotFound /> },
    ],
  },
]);
