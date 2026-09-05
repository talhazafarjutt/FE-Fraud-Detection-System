import type { AlertSeverity } from '@/api/schemas/common';
import { BAND_CLASS, type RiskBand, bandFor } from '@/lib/risk';
import { cx } from './primitives';

const CHIP_BASE =
  'inline-flex items-center border px-2 py-1 font-mono text-[11px] uppercase tracking-tag leading-none';

/**
 * Status colours per the brief's mapping. Only CONFIRMED_FRAUD is filled — the
 * site fills only its most urgent chip and everything else is a hairline
 * border with coloured text.
 */
const STATUS_CLASS: Record<string, string> = {
  OPEN: 'border-ultra text-ultra',
  IN_REVIEW: 'border-ink-2 text-ink-2',
  ESCALATED: 'border-amber text-amber',
  CONFIRMED_FRAUD: 'border-carmine bg-carmine text-on-carmine',
  FALSE_POSITIVE: 'border-sage text-sage',
  CLOSED: 'border-ink-3 text-ink-3',
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={cx(CHIP_BASE, STATUS_CLASS[status] ?? 'border-rule text-ink-2')}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

const SEVERITY_CLASS: Record<string, string> = {
  LOW: BAND_CLASS.LOW,
  MEDIUM: BAND_CLASS.MEDIUM,
  HIGH: BAND_CLASS.HIGH,
  CRITICAL: BAND_CLASS.CRITICAL,
};

export function SeverityChip({ severity }: { severity: AlertSeverity | string }) {
  return (
    <span className={cx(CHIP_BASE, SEVERITY_CLASS[severity] ?? 'border-rule text-ink-2')}>
      {severity}
    </span>
  );
}

export function BandChip({ probability }: { probability: number }) {
  const band: RiskBand = bandFor(probability);
  return <span className={cx(CHIP_BASE, BAND_CLASS[band])}>{band}</span>;
}
