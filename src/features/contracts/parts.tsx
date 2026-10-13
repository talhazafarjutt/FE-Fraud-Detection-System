import { cx } from '@/components/primitives';

/** Query-key root for every register read. */
export const contractsKey = ['islamic', 'contracts'] as const;

/** The console's route for one registered contract. */
export function contractPath(contractId: string): string {
  return `/contracts/${encodeURIComponent(contractId)}`;
}

const CHIP_BASE =
  'inline-flex items-center border px-2 py-1 font-mono text-[11px] uppercase tracking-tag leading-none';

/**
 * ACTIVE is the only status a payment may move on; SETTLED and CANCELLED are
 * closed (any payment on them is a HIGH finding), DEFAULTED is still open but
 * in arrears.
 */
const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'border-sage text-sage',
  SETTLED: 'border-ink-3 text-ink-3',
  CANCELLED: 'border-ink-3 text-ink-3',
  DEFAULTED: 'border-carmine text-carmine',
};

export function ContractStatusChip({ status }: { status: string }) {
  return (
    <span className={cx(CHIP_BASE, STATUS_CLASS[status] ?? 'border-rule text-ink-2')}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/** "48 × 4,350.00", or null when the register holds no schedule. */
export function scheduleText(
  tenor: number | null | undefined,
  scheduled: string | null | undefined,
  format: (value: string) => string,
): string | null {
  if (typeof tenor !== 'number' || !scheduled) return null;
  return `${tenor} × ${format(scheduled)}`;
}

/** Today's date in UTC, the day the server compares due dates against. */
export function todayIso(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}
