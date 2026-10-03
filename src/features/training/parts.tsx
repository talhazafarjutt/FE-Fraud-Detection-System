import { cx } from '@/components/primitives';

const CHIP =
  'inline-flex items-center border px-2 py-1 font-mono text-[11px] uppercase tracking-tag leading-none';

/** Plain-language names: "CANDIDATE" means nothing to a supervisor. */
export const TRAINING_STATUS_LABEL: Record<string, string> = {
  CANDIDATE: 'Awaiting review',
  APPROVED: 'Approved for training',
  EXCLUDED: 'Excluded',
};

const TRAINING_STATUS_CLASS: Record<string, string> = {
  CANDIDATE: 'border-ultra text-ultra',
  APPROVED: 'border-sage text-sage',
  EXCLUDED: 'border-ink-3 text-ink-3',
};

export function TrainingStatusChip({ status }: { status: string }) {
  return (
    <span className={cx(CHIP, TRAINING_STATUS_CLASS[status] ?? 'border-rule text-ink-2')}>
      {TRAINING_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export const RUN_STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

const RUN_STATUS_CLASS: Record<string, string> = {
  QUEUED: 'border-ultra text-ultra',
  RUNNING: 'border-amber text-amber',
  COMPLETED: 'border-sage text-sage',
  FAILED: 'border-carmine bg-carmine text-on-carmine',
  CANCELLED: 'border-ink-3 text-ink-3',
};

export function RunStatusChip({ status }: { status: string }) {
  return (
    <span className={cx(CHIP, RUN_STATUS_CLASS[status] ?? 'border-rule text-ink-2')}>
      {RUN_STATUS_LABEL[status] ?? status}
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
 * The same advisory rules the server attaches to a run, applied before it is
 * requested so nobody queues a one-sided dataset by accident. Kept identical to
 * app/services/training_eval.dataset_warnings.
 */
export function datasetWarnings(counts: Record<string, number>): string[] {
  const warnings: string[] = [];
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total < 20) {
    warnings.push(
      `Only ${total} record(s). Fine for a targeted correction; too few to retrain a model from on its own.`,
    );
  }
  const present = Object.entries(counts).filter(([, n]) => n > 0);
  if (present.length === 1) {
    warnings.push(
      `Every record is ${present[0]![0]}. A model trained on one class learns nothing about telling the two apart.`,
    );
  }
  return warnings;
}

export function countLabels(labels: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const label of labels) counts[label] = (counts[label] ?? 0) + 1;
  return counts;
}
