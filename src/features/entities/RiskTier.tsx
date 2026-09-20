import { cx } from '@/components/primitives';

/**
 * Risk tier 1–5 as a filled bar rather than a bare number.
 *
 * A number in a column is read; a bar is seen. Scanning for the outliers in a
 * list of 250 parties is the actual task here.
 */
export function RiskTier({ tier }: { tier: number }) {
  const clamped = Math.max(0, Math.min(5, Math.round(tier)));
  const tone = clamped >= 4 ? 'bg-carmine' : clamped === 3 ? 'bg-amber' : 'bg-sage';

  return (
    <span className="inline-flex items-center gap-2" title={`Risk tier ${clamped} of 5`}>
      <span className="inline-flex gap-px" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={cx('h-3 w-1', step <= clamped ? tone : 'bg-rule-soft')}
          />
        ))}
      </span>
      <span className="font-mono text-[12px] tabular-nums">{clamped}</span>
    </span>
  );
}
