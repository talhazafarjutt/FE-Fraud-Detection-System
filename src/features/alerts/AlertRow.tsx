import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { Alert } from '@/api/schemas/alerts';
import { SeverityChip, StatusChip } from '@/components/Chips';
import { formatAbsolute, formatRelative, shortId } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { BAND_HEX, bandFor, formatProbability } from '@/lib/risk';

interface Props {
  alert: Alert;
  onHover: (alertId: string) => void;
}

/**
 * Memoised on `alert` identity. Props are primitives plus one stable callback,
 * so a new page arriving does not re-render rows that are already on screen.
 */
export const AlertRow = memo(function AlertRow({ alert, onHover }: Props) {
  const band = bandFor(alert.fraud_probability);
  const percent = formatProbability(alert.fraud_probability);

  return (
    <tr
      className="border-b border-rule-soft align-middle transition-colors hover:bg-paper"
      onMouseEnter={() => onHover(alert.id)}
      onFocus={() => onHover(alert.id)}
    >
      <td className="py-3 pr-4">
        <SeverityChip severity={alert.severity} />
      </td>

      <td className="py-3 pr-4">
        <div className="flex items-center justify-end gap-3">
          {/* A bar plus the figure: the shape reads at a glance from the back
              of a room, the number is there for the person leaning in. */}
          <span className="h-[6px] w-24 bg-rule-soft" aria-hidden="true">
            <span
              className="block h-full"
              style={{
                width: `${Math.min(100, alert.fraud_probability * 100)}%`,
                background: BAND_HEX[band],
              }}
            />
          </span>
          <span className="num w-14 text-right font-mono text-[12px] tabular-nums text-ink">
            {percent}
            <span className="ml-0.5 text-ink-3">%</span>
          </span>
        </div>
      </td>

      <td className="py-3 pr-4 text-right">
        <span className="num font-mono text-[12px] tabular-nums text-ink">
          {formatAmount(alert.amount)}
        </span>
        <span className="ml-2 font-mono text-[11px] uppercase tracking-tag text-ink-3">
          {alert.currency ?? ''}
        </span>
      </td>

      <td className="py-3 pr-4">
        <StatusChip status={alert.status} />
      </td>

      <td className="py-3 pr-4">
        <span className="font-mono text-[11px] uppercase tracking-tag text-ink-2">
          {alert.team}
        </span>
      </td>

      <td className="py-3 pr-4">
        <span
          className="font-mono text-[11px] uppercase tracking-tag text-ink-2"
          title={formatAbsolute(alert.opened_at)}
        >
          {formatRelative(alert.opened_at)}
        </span>
      </td>

      <td className="py-3 pr-4">
        <span
          className="font-mono text-[11px] uppercase tracking-tag text-ink-3"
          title={alert.assigned_to ?? 'Unassigned'}
        >
          {alert.assigned_to ? shortId(alert.assigned_to) : 'Unassigned'}
        </span>
      </td>

      <td className="py-3 text-right">
        <Link
          to={`/alerts/${alert.id}`}
          className="font-mono text-[11px] uppercase tracking-label text-ultra hover:text-ultra-lift"
        >
          Open case
        </Link>
      </td>
    </tr>
  );
});
