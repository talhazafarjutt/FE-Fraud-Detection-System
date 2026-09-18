import { BAND_HEX, type RiskDisplay } from '@/lib/risk';

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
export function ProbabilityDial({ risk }: { risk: RiskDisplay | null }) {
  if (risk === null) {
    return (
      <div className="flex h-[168px] w-[168px] items-center justify-center border border-rule-soft">
        <span className="mono-label text-center text-ink-3">
          Not
          <br />
          scored
        </span>
      </div>
    );
  }

  const band = risk.band;
  // risk.value is 0–100; the arc needs 0–1.
  const clamped = Math.max(0, Math.min(1, risk.value / 100));

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Risk score ${risk.value} out of 100, ${band} band`}
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
        {/* 0–100, never a percentage and never called a probability. */}
        <span className="font-display text-[46px] font-bold leading-none tracking-tighter text-ink">
          {risk.value}
        </span>
        <span className="mono-label mt-2 text-ink-3">{band}</span>
        {risk.derived ? (
          <span
            className="mt-1 font-mono text-[9px] uppercase tracking-tag text-ink-3"
            title="The risk engine has not scored this alert; this is derived from the model's fraud_probability."
          >
            derived
          </span>
        ) : null}
      </div>
    </div>
  );
}
