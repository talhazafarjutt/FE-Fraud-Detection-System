import { useQuery } from '@tanstack/react-query';
import { readiness } from '@/api/endpoints/auth';
import { cx } from './primitives';

/**
 * /readyz checks Postgres, Redis and the model. A green dot that turns red on
 * stage if a dependency drops is worth having.
 *
 * COLD START: the API sleeps on its hosting tier, and the first request after
 * an idle period can take 30–60s to answer while the instance boots. Reporting
 * that as "Unreachable" is wrong — the platform is fine, it is waking. Only a
 * failure after the service has had time to answer is a real outage, so the
 * first attempts are retried with backoff and labelled honestly meanwhile.
 */

/** Roughly covers a cold boot: 5s + 10s + 20s + 30s ≈ 65s of patience. */
const COLD_START_RETRIES = 4;

export function StatusDot() {
  const { data, isError, isPending, failureCount } = useQuery({
    queryKey: ['readyz'],
    queryFn: () => readiness(),
    refetchInterval: 15_000,
    retry: COLD_START_RETRIES,
    retryDelay: (attempt) => Math.min(30_000, 5_000 * 2 ** attempt),
    staleTime: 10_000,
  });

  const healthy = !isError && data?.status === 'ok';
  const checks = data?.checks ?? {};
  const failing = Object.entries(checks)
    .filter(([, value]) => value !== 'ok')
    .map(([key]) => key);

  // Still trying, and it has already missed at least once: that is a boot, not
  // a failure. Say so rather than showing red on a perfectly healthy platform.
  const waking = isPending && failureCount > 0;

  const label = waking
    ? 'Waking up'
    : isPending
      ? 'Checking'
      : healthy && failing.length === 0
        ? 'Systems ready'
        : failing.length
          ? `Degraded: ${failing.join(', ')}`
          : 'Unreachable';

  const title = waking
    ? 'The API sleeps when idle and takes up to a minute to start. This is not an outage.'
    : label;

  return (
    <span className="tag" title={title}>
      <span
        className={cx(
          'inline-block h-2 w-2 rounded-full',
          waking
            ? 'animate-pulse bg-amber'
            : isPending
              ? 'bg-ink-3'
              : healthy && !failing.length
                ? 'bg-sage'
                : 'bg-carmine',
        )}
      />
      {label}
    </span>
  );
}
