import { useMemo, useState } from 'react';
import type { Alert } from '@/api/schemas/alerts';
import { cx } from '@/components/primitives';
import { RISK_THRESHOLDS } from '@/lib/risk';

const STOPS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

/**
 * §15.4 threshold explorer.
 *
 * This is a **what-if replayed over historical closed cases**, not a live
 * control and not a projection. Every case counted here has a real analyst
 * verdict attached, so moving the slider asks: "of the cases we already
 * resolved, which would this threshold have caught?"
 *
 * It is deliberately restricted to CONFIRMED_FRAUD and FALSE_POSITIVE. Open
 * cases have no verdict, so including them would mean guessing — and §15.5
 * forbids inventing metrics the data does not support.
 *
 * The point of the panel is to turn an abstract model parameter into a staffing
 * and risk conversation.
 */
export function ThresholdExplorer({ alerts }: { alerts: readonly Alert[] }) {
  const [threshold, setThreshold] = useState<number>(RISK_THRESHOLDS.HIGH);

  const closed = useMemo(
    () =>
      alerts
        .filter((a) => a.status === 'CONFIRMED_FRAUD' || a.status === 'FALSE_POSITIVE')
        .map((a) => ({
          probability: a.fraud_probability,
          confirmed: a.status === 'CONFIRMED_FRAUD',
        })),
    [alerts],
  );

  const at = useMemo(() => {
    const evaluate = (cut: number) => {
      const raised = closed.filter((c) => c.probability >= cut);
      const confirmed = raised.filter((c) => c.confirmed).length;
      const falsePositives = raised.length - confirmed;
      // Fraud below the cut would not have raised a case at all: caught by a
      // human only if something else surfaced it. We can count it because these
      // cases carry a real verdict.
      const missedFraud = closed.filter((c) => !(c.probability >= cut) && c.confirmed).length;
      return {
        cut,
        raised: raised.length,
        confirmed,
        falsePositives,
        missedFraud,
        precision: raised.length === 0 ? null : confirmed / raised.length,
      };
    };
    return { current: evaluate(threshold), stops: STOPS.map(evaluate) };
  }, [closed, threshold]);

  if (closed.length === 0) {
    return (
      <div className="border border-rule bg-surface px-6 py-10 text-center">
        <p className="mono-label mb-2 text-ink-3">No closed cases yet</p>
        <p className="mx-auto max-w-md text-ink-2">
          The explorer replays historical verdicts. Once cases have been confirmed or dismissed, it
          can show how a different threshold would have changed the workload.
        </p>
      </div>
    );
  }

  const { current } = at;

  return (
    <div className="space-y-6 border border-rule bg-surface p-6">
      <div className="border border-amber px-4 py-3">
        <p className="mono-label text-amber">
          What-if on historical closed cases — not a live control
        </p>
        <p className="mt-2 text-[14px] text-ink-2">
          Changing the real threshold is a configuration change, not a UI toggle. This replays{' '}
          {closed.length.toLocaleString('en-GB')} already-resolved case
          {closed.length === 1 ? '' : 's'}.
        </p>
      </div>

      <div>
        <label
          htmlFor="threshold"
          className="mono-label mb-3 flex items-center justify-between text-ink-3"
        >
          <span>Alert threshold</span>
          <span className="num tabular-nums text-ink">{threshold.toFixed(2)}</span>
        </label>
        <input
          id="threshold"
          type="range"
          min={0.3}
          max={0.95}
          step={0.01}
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
          className="w-full accent-[color:var(--ultra)]"
        />
        <p className="mt-2 font-mono text-[10px] uppercase tracking-tag text-ink-3">
          Live threshold is {RISK_THRESHOLDS.HIGH.toFixed(2)}
        </p>
      </div>

      <dl className="grid gap-px border border-rule bg-rule sm:grid-cols-4">
        <Cell label="Alerts raised" value={current.raised} />
        <Cell label="Confirmed fraud" value={current.confirmed} tone="carmine" />
        <Cell label="False positives" value={current.falsePositives} tone="amber" />
        <Cell
          label="Fraud missed"
          value={current.missedFraud}
          tone={current.missedFraud > 0 ? 'carmine' : 'normal'}
        />
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr className="border-b border-rule">
              {['Threshold', 'Raised', 'Confirmed', 'False positive', 'Missed', 'Precision'].map(
                (label, index) => (
                  <th
                    key={label}
                    scope="col"
                    className={cx(
                      'py-3 pr-4 font-mono text-[11px] font-normal uppercase tracking-tag text-ink-3',
                      index === 0 ? 'text-left' : 'text-right',
                    )}
                  >
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {at.stops.map((stop) => (
              <tr
                key={stop.cut}
                className={cx(
                  'border-b border-rule-soft',
                  stop.cut === RISK_THRESHOLDS.HIGH && 'bg-paper',
                )}
              >
                <td className="num py-3 pr-4 font-mono text-[12px] tabular-nums text-ink">
                  {stop.cut.toFixed(2)}
                  {stop.cut === RISK_THRESHOLDS.HIGH ? (
                    <span className="ml-2 text-[10px] uppercase tracking-tag text-ink-3">live</span>
                  ) : null}
                </td>
                <td className="num py-3 pr-4 text-right font-mono text-[12px] tabular-nums text-ink">
                  {stop.raised}
                </td>
                <td className="num py-3 pr-4 text-right font-mono text-[12px] tabular-nums text-carmine">
                  {stop.confirmed}
                </td>
                <td className="num py-3 pr-4 text-right font-mono text-[12px] tabular-nums text-amber">
                  {stop.falsePositives}
                </td>
                <td className="num py-3 pr-4 text-right font-mono text-[12px] tabular-nums text-ink-2">
                  {stop.missedFraud}
                </td>
                <td className="num py-3 pr-4 text-right font-mono text-[12px] tabular-nums text-ink">
                  {stop.precision === null ? '—' : `${Math.round(stop.precision * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-rule-soft pt-4 text-[14px] leading-relaxed text-ink-2">
        Raising the threshold cuts false positives and analyst time, and lets more fraud through.
        Lowering it does the reverse. The numbers above are what actually happened on these cases,
        so the trade is a staffing decision rather than a guess.
      </p>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'normal' | 'carmine' | 'amber';
}) {
  return (
    <div className="bg-surface p-5">
      <p className="mono-label mb-2 text-ink-3">{label}</p>
      <p
        className={cx(
          'font-display text-[28px] font-bold leading-none tracking-tight',
          tone === 'carmine' && 'text-carmine',
          tone === 'amber' && 'text-amber',
          (!tone || tone === 'normal') && 'text-ink',
        )}
      >
        {value.toLocaleString('en-GB')}
      </p>
    </div>
  );
}
