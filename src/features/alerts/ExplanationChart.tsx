import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import type { Reason } from '@/api/schemas/common';

/**
 * Recharts lives in this module and nowhere else, so it is only fetched when a
 * user opens a case — it never lands in the initial bundle.
 *
 * Colours are the domain palette, never Recharts defaults: contributions that
 * push the score up are --carmine, those that pull it down are --sage.
 */
export default function ExplanationChart({ reasons }: { reasons: readonly Reason[] }) {
  const sorted = [...reasons].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution),
  );
  const height = Math.max(160, sorted.length * 34 + 40);
  const extent = Math.max(...sorted.map((r) => Math.abs(r.contribution)), 0.01);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 0, right: 32, bottom: 0, left: 8 }}
        barCategoryGap={10}
      >
        <XAxis
          type="number"
          domain={[-extent, extent]}
          tickLine={false}
          axisLine={{ stroke: 'var(--rule)' }}
          tick={{
            fill: 'var(--ink-3)',
            fontSize: 10,
            fontFamily: 'var(--mono)',
            letterSpacing: '0.06em',
          }}
        />
        <YAxis
          type="category"
          dataKey="feature"
          width={150}
          tickLine={false}
          axisLine={{ stroke: 'var(--rule)' }}
          tick={{
            fill: 'var(--ink-2)',
            fontSize: 10,
            fontFamily: 'var(--mono)',
            letterSpacing: '0.06em',
          }}
        />
        <ReferenceLine x={0} stroke="var(--rule)" />
        <Bar dataKey="contribution" isAnimationActive={false}>
          {sorted.map((reason) => (
            <Cell
              key={reason.feature}
              fill={reason.contribution >= 0 ? 'var(--carmine)' : 'var(--sage)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
