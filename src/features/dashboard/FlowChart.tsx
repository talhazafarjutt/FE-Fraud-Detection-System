import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MetricsSeriesPoint } from '@/api/schemas/metrics';

/**
 * Transaction flow — the fraud AND non-fraud view.
 *
 * Three bands: clean traffic, flagged but unresolved, confirmed fraud. The
 * ratio is the story. A chart built from alerts alone would show only the
 * flagged sliver and make the model look far busier than it is.
 *
 * Recharts is imported here and nowhere else on this route, so it stays out of
 * the initial bundle.
 */
export default function FlowChart({ series }: { series: readonly MetricsSeriesPoint[] }) {
  const data = series.map((point) => {
    const confirmed = point.confirmed_fraud;
    // Flagged-but-unresolved is everything alerted that is not yet confirmed.
    const unresolved = Math.max(0, point.alerts - confirmed);
    const clean = Math.max(0, point.transactions - point.alerts);
    return { t: point.t, clean, unresolved, confirmed };
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--rule)" strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="t"
          tickLine={false}
          axisLine={{ stroke: 'var(--rule)' }}
          tick={{ fill: 'var(--ink-3)', fontSize: 10, fontFamily: 'var(--mono)' }}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={{ stroke: 'var(--rule)' }}
          tick={{ fill: 'var(--ink-3)', fontSize: 10, fontFamily: 'var(--mono)' }}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--rule)',
            borderRadius: 0,
            fontFamily: 'var(--mono)',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--ink)',
          }}
          cursor={{ stroke: 'var(--rule)' }}
        />
        <Legend
          wrapperStyle={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--ink-3)',
          }}
        />
        {/* Palette is §14.6 only — no Recharts defaults, no gradients. */}
        <Area
          type="monotone"
          dataKey="clean"
          name="Clean"
          stackId="1"
          stroke="var(--sage)"
          fill="var(--sage)"
          fillOpacity={0.18}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="unresolved"
          name="Flagged"
          stackId="1"
          stroke="var(--amber)"
          fill="var(--amber)"
          fillOpacity={0.3}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="confirmed"
          name="Confirmed fraud"
          stackId="1"
          stroke="var(--carmine)"
          fill="var(--carmine)"
          fillOpacity={0.45}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
