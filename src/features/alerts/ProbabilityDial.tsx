import { BAND_HEX, bandFor, formatProbability } from '@/lib/risk';

const SIZE = 168;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
/** Three-quarter arc, opening at the bottom. */
const SWEEP = 270;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_LENGTH = CIRCUMFERENCE * (SWEEP / 360);

/**
 * A thin arc, --rule track, band colour for the value. No gradient, no shadow —
 * depth on this design comes from hairlines, not effects.
 */
export function ProbabilityDial({ probability }: { probability: number }) {
  const band = bandFor(probability);
  const clamped = Math.max(0, Math.min(1, probability));

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Fraud probability ${formatProbability(probability)} percent, ${band} band`}
        // Rotate so the arc's gap sits at the bottom.
        style={{ transform: 'rotate(135deg)' }}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--rule)"
          strokeWidth={STROKE}
          strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={BAND_HEX[band]}
          strokeWidth={STROKE}
          strokeDasharray={`${ARC_LENGTH * clamped} ${CIRCUMFERENCE}`}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[46px] font-bold leading-none tracking-tighter text-ink">
          {formatProbability(probability)}
          <span className="ml-1 font-mono text-[13px] font-normal tracking-tag text-ink-3">%</span>
        </span>
        <span className="mono-label mt-2 text-ink-3">{band}</span>
      </div>
    </div>
  );
}
