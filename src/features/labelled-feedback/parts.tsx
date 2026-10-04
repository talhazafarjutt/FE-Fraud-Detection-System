import { cx } from '@/components/primitives';

const CHIP =
  'inline-flex items-center border px-2 py-1 font-mono text-[11px] uppercase tracking-tag leading-none';

/** Plain-language names: "PENDING" means nothing to a supervisor. */
export const CURATION_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Awaiting validation',
  VALIDATED: 'Validated',
  EXCLUDED: 'Excluded',
};

const CURATION_STATUS_CLASS: Record<string, string> = {
  PENDING: 'border-ultra text-ultra',
  VALIDATED: 'border-sage text-sage',
  EXCLUDED: 'border-ink-3 text-ink-3',
};

export function CurationStatusChip({ status }: { status: string }) {
  return (
    <span className={cx(CHIP, CURATION_STATUS_CLASS[status] ?? 'border-rule text-ink-2')}>
      {CURATION_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export const BATCH_STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

const BATCH_STATUS_CLASS: Record<string, string> = {
  QUEUED: 'border-ultra text-ultra',
  PROCESSING: 'border-amber text-amber',
  COMPLETED: 'border-sage text-sage',
  FAILED: 'border-carmine bg-carmine text-on-carmine',
  CANCELLED: 'border-ink-3 text-ink-3',
};

export function BatchStatusChip({ status }: { status: string }) {
  return (
    <span className={cx(CHIP, BATCH_STATUS_CLASS[status] ?? 'border-rule text-ink-2')}>
      {BATCH_STATUS_LABEL[status] ?? status}
    </span>
  );
}

const LABEL_CLASS: Record<string, string> = {
  CONFIRMED_FRAUD: 'border-carmine text-carmine',
  FALSE_POSITIVE: 'border-sage text-sage',
  INCONCLUSIVE: 'border-ink-3 text-ink-3',
};

export function OutcomeChip({ label }: { label: string }) {
  return (
    <span className={cx(CHIP, LABEL_CLASS[label] ?? 'border-rule text-ink-2')}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

/**
 * The same advisory rules the server attaches to a batch, applied before it is
 * created so nobody queues a one-sided batch by accident. Kept identical to
 * app/services/engine_check.dataset_warnings.
 */
export function datasetWarnings(counts: Record<string, number>): string[] {
  const warnings: string[] = [];
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total < 20) {
    warnings.push(
      `Only ${total} record(s). Fine for a targeted check; too few to draw conclusions from on its own.`,
    );
  }
  const present = Object.entries(counts).filter(([, n]) => n > 0);
  if (present.length === 1) {
    warnings.push(
      `Every record is ${present[0]![0]}. A one-class batch says nothing about how well the engine tells the two apart.`,
    );
  }
  return warnings;
}

export function countLabels(labels: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const label of labels) counts[label] = (counts[label] ?? 0) + 1;
  return counts;
}
