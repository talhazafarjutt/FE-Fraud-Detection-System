import type { AlertEvent } from '@/api/schemas/alerts';
import { StatusChip } from '@/components/Chips';
import { formatAbsolute, formatRelative, shortId } from '@/lib/format';

/**
 * The audit story. Every state change carries the actor and the timestamp the
 * server recorded — this is the pane a government buyer reads most carefully.
 *
 * Notes are user-controlled text and are rendered as text. There is no
 * dangerouslySetInnerHTML anywhere in this codebase; JSX escaping is the
 * defence and it must stay that way.
 */
export function CaseTrail({ events }: { events: readonly AlertEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="border border-rule-soft px-4 py-6 text-ink-2">
        No actions have been recorded against this case yet.
      </p>
    );
  }

  const ordered = [...events].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );

  return (
    <ol className="relative">
      {ordered.map((event, index) => (
        <li key={event.id} className="relative flex gap-5 pb-7 last:pb-0">
          {/* Rail: a 1px line with a small square node, not a rounded dot. */}
          <div className="relative flex w-3 shrink-0 justify-center">
            <span className="mt-[6px] h-[7px] w-[7px] shrink-0 bg-ultra" aria-hidden="true" />
            {index < ordered.length - 1 ? (
              <span
                className="absolute left-1/2 top-[16px] h-full w-px -translate-x-1/2 bg-rule"
                aria-hidden="true"
              />
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {event.from_status ? (
                <>
                  <StatusChip status={event.from_status} />
                  <span className="font-mono text-[11px] text-ink-3" aria-label="changed to">
                    →
                  </span>
                </>
              ) : (
                <span className="mono-label text-ink-3">Opened as</span>
              )}
              <StatusChip status={event.to_status} />
            </div>

            {event.note ? (
              <p className="mt-3 border-l border-rule pl-4 text-[15px] leading-relaxed text-ink-2">
                {event.note}
              </p>
            ) : null}

            <p className="mt-3 font-mono text-[10px] uppercase tracking-tag text-ink-3">
              <span title={event.actor_user_id ?? 'Recorded by the platform'}>
                {event.actor_user_id ? `Actor ${shortId(event.actor_user_id)}` : 'System'}
              </span>
              <span className="mx-2">·</span>
              <span title={formatAbsolute(event.created_at)}>
                {formatRelative(event.created_at)}
              </span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
