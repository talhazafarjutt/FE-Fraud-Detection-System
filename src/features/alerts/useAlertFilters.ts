import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AlertFilters } from '@/api/schemas/alerts';

export const STATUS_OPTIONS = [
  'OPEN',
  'IN_REVIEW',
  'ESCALATED',
  'CONFIRMED_FRAUD',
  'FALSE_POSITIVE',
  'CLOSED',
] as const;

export const SEVERITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export const PAGE_SIZES = [25, 50, 100, 200] as const;

const DEFAULT_LIMIT = 50;

/**
 * Filters live in the URL query string so a view is shareable and survives a
 * reload — on stage that means a filtered queue can be handed to someone as a
 * link rather than re-clicked.
 */
export function useAlertFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<AlertFilters>(() => {
    const status = params.get('status');
    const severity = params.get('severity');
    const minRiskScore = params.get('min_risk_score');
    const limit = params.get('limit');

    const parsedRiskScore = minRiskScore === null ? NaN : Number(minRiskScore);
    const parsedLimit = limit === null ? NaN : Number(limit);

    return {
      ...(status && STATUS_OPTIONS.includes(status as (typeof STATUS_OPTIONS)[number])
        ? { status }
        : {}),
      ...(severity && SEVERITY_OPTIONS.includes(severity as (typeof SEVERITY_OPTIONS)[number])
        ? { severity }
        : {}),
      // 0-100, the same scale the risk score itself uses. The old filter was
      // a 0-1 probability rendered as a percentage, so the URL, the slider and
      // the column header each showed the number on a different scale.
      ...(Number.isFinite(parsedRiskScore) && parsedRiskScore > 0 && parsedRiskScore <= 100
        ? { min_risk_score: parsedRiskScore }
        : {}),
      limit:
        Number.isFinite(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 200
          ? parsedLimit
          : DEFAULT_LIMIT,
    };
  }, [params]);

  const setFilter = useCallback(
    (key: 'status' | 'severity' | 'min_risk_score' | 'limit', value: string | null) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const clearAll = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [
    setParams,
  ]);

  const activeCount =
    (filters.status ? 1 : 0) +
    (filters.severity ? 1 : 0) +
    (filters.min_risk_score !== undefined ? 1 : 0);

  return { filters, setFilter, clearAll, activeCount };
}
