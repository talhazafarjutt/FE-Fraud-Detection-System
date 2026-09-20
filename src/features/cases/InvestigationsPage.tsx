import CasesPage from './CasesPage';

/**
 * The same list as Cases, filtered to IN_REVIEW and ESCALATED — the active
 * workload rather than the full history.
 */
export default function InvestigationsPage() {
  return <CasesPage investigationsOnly />;
}
