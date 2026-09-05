import { useQuery } from '@tanstack/react-query';
import { readiness } from '@/api/endpoints/auth';
import { cx } from './primitives';

/**
 * /readyz checks Postgres, Redis and the model. A green dot that turns red on
 * stage if a dependency drops is worth having.
 */
export function StatusDot() {
  const { data, isError, isPending } = useQuery({
    queryKey: ['readyz'],
    queryFn: () => readiness(),
    refetchInterval: 15_000,
    retry: false,
    staleTime: 10_000,
  });

  const healthy = !isError && data?.status === 'ok';
  const checks = data?.checks ?? {};
  const failing = Object.entries(checks)
    .filter(([, value]) => value !== 'ok')
    .map(([key]) => key);

  const label = isPending
    ? 'Checking'
    : healthy && failing.length === 0
      ? 'Systems ready'
      : failing.length
        ? `Degraded: ${failing.join(', ')}`
        : 'Unreachable';

  return (
    <span className="tag" title={label}>
      <span
        className={cx(
          'inline-block h-2 w-2 rounded-full',
          isPending ? 'bg-ink-3' : healthy && !failing.length ? 'bg-sage' : 'bg-carmine',
        )}
      />
      {label}
    </span>
  );
}
