/**
 * Risk bands, expressed on the 0–100 scale the whole product uses.
 *
 * These were 0–1 and every screen converted on its own: the dashboard printed
 * bands as "0.4 – 0.7" while the alert queue next to it showed 83, and the
 * threshold explorer multiplied by 100 with a comment apologising for it. One
 * scale, defined once. The server's cut points are MEDIUM >= 40, HIGH >= 70,
 * and an alert is raised at >= 70; CRITICAL >= 90 is a presentation band only.
 * The UI must never disagree with the backend about where a score sits.
 */
export const RISK_THRESHOLDS = { MEDIUM: 40, HIGH: 70, CRITICAL: 90 } as const;

/**
 * The same cut points on the legacy 0–1 probability scale.
 *
 * Only for comparing against a raw `fraud_probability` that the older contract
 * still returns — never for anything a user reads.
 */
export const RISK_THRESHOLDS_P = {
  MEDIUM: RISK_THRESHOLDS.MEDIUM / 100,
  HIGH: RISK_THRESHOLDS.HIGH / 100,
  CRITICAL: RISK_THRESHOLDS.CRITICAL / 100,
} as const;

export type RiskBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Band from a risk score on 0–100. */
export function bandFor(score: number): RiskBand {
  if (score >= RISK_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (score >= RISK_THRESHOLDS.HIGH) return 'HIGH';
  if (score >= RISK_THRESHOLDS.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

/**
 * Tailwind classes per band. The site fills only its most urgent chip; every
 * other chip is 1px border + coloured text.
 */
export const BAND_CLASS: Record<RiskBand, string> = {
  LOW: 'border-sage text-sage',
  MEDIUM: 'border-amber text-amber',
  HIGH: 'border-carmine text-carmine',
  CRITICAL: 'border-carmine bg-carmine text-on-carmine',
};

export const BAND_HEX: Record<RiskBand, string> = {
  LOW: 'var(--sage)',
  MEDIUM: 'var(--amber)',
  HIGH: 'var(--carmine)',
  CRITICAL: 'var(--carmine)',
};

/** A risk score for display: integer, no unit, never a percent sign. */
export function formatRiskScore(score: number): string {
  return String(Math.round(score));
}

/* ------------------------------------------------------------------ *
 * Risk score (0–100)
 *
 * V1 moves the headline number to `risk_score`, an integer 0–100 that is NOT a
 * probability and must never be rendered with a % sign.
 *
 * VERIFIED against the deployed API: `risk_score` is null on every alert and
 * every transaction row we have seen — all current alerts come from
 * `stub-rules`, which only sets `fraud_probability` (0–1). So the UI has to
 * cope with both, and has to be honest about which one it is showing rather
 * than quietly presenting a probability as if it were the new score.
 * ------------------------------------------------------------------ */

export type RiskSource = 'risk_score' | 'fraud_probability';

export interface RiskDisplay {
  /** 0–100, rounded. */
  value: number;
  source: RiskSource;
  band: RiskBand;
  /** True when derived from the legacy probability rather than a real score. */
  derived: boolean;
}

export function riskDisplay(
  riskScore: number | null | undefined,
  fraudProbability: number | null | undefined,
): RiskDisplay | null {
  if (typeof riskScore === 'number') {
    const value = Math.round(riskScore);
    return { value, source: 'risk_score', band: bandFor(value), derived: false };
  }
  if (typeof fraudProbability === 'number') {
    return {
      value: Math.round(fraudProbability * 100),
      source: 'fraud_probability',
      band: bandFor(fraudProbability * 100),
      derived: true,
    };
  }
  return null;
}

/**
 * Kept as a name callers already use; identical to `bandFor` now that there is
 * only one scale.
 */
export const bandForScore = bandFor;
