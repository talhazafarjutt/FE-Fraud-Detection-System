import { useEffect, useState } from 'react';
import { Button } from '@/components/primitives';
import {
  PAGE_SIZES,
  SEVERITY_OPTIONS,
  STATUS_OPTIONS,
  useAlertFilters,
} from './useAlertFilters';

type Filters = ReturnType<typeof useAlertFilters>;

export function AlertFilterBar({ filters, setFilter, clearAll, activeCount }: Filters) {
  // The slider updates continuously but the query is debounced at 300 ms —
  // dragging it must not fire a request per pixel.
  const [sliderValue, setSliderValue] = useState(
    filters.min_probability !== undefined ? Math.round(filters.min_probability * 100) : 0,
  );

  useEffect(() => {
    setSliderValue(
      filters.min_probability !== undefined ? Math.round(filters.min_probability * 100) : 0,
    );
  }, [filters.min_probability]);

  useEffect(() => {
    const current = filters.min_probability !== undefined ? filters.min_probability : 0;
    const next = sliderValue / 100;
    if (Math.abs(current - next) < 0.0001) return;

    const timer = setTimeout(() => {
      setFilter('min_probability', sliderValue === 0 ? null : String(next));
    }, 300);
    return () => clearTimeout(timer);
  }, [sliderValue, filters.min_probability, setFilter]);

  return (
    <div className="border border-rule bg-surface">
      <div className="grid gap-px bg-rule md:grid-cols-4">
        <label className="bg-surface p-4">
          <span className="mono-label mb-2 block text-ink-3">Status</span>
          <select
            className="field"
            value={filters.status ?? ''}
            onChange={(event) => setFilter('status', event.target.value || null)}
          >
            <option value="">Any status</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>

        <label className="bg-surface p-4">
          <span className="mono-label mb-2 block text-ink-3">Severity</span>
          <select
            className="field"
            value={filters.severity ?? ''}
            onChange={(event) => setFilter('severity', event.target.value || null)}
          >
            <option value="">Any severity</option>
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="bg-surface p-4">
          <span className="mono-label mb-2 flex items-center justify-between text-ink-3">
            <span>Minimum probability</span>
            <span className="num tabular-nums text-ink">{sliderValue}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={sliderValue}
            onChange={(event) => setSliderValue(Number(event.target.value))}
            className="mt-3 w-full accent-[color:var(--ultra)]"
            aria-label="Minimum fraud probability"
          />
        </label>

        <label className="bg-surface p-4">
          <span className="mono-label mb-2 block text-ink-3">Page size</span>
          <select
            className="field"
            value={String(filters.limit ?? 50)}
            onChange={(event) => setFilter('limit', event.target.value)}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
        </label>
      </div>

      {activeCount > 0 ? (
        <div className="flex items-center justify-between border-t border-rule px-4 py-3">
          <span className="mono-label text-ink-3">
            {activeCount} filter{activeCount === 1 ? '' : 's'} applied
          </span>
          <Button variant="ghost" onClick={clearAll}>
            Clear filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}
