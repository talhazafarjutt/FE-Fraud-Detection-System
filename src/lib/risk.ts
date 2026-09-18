/**
 * Risk bands. Cut points are the server's (MEDIUM >= 0.40, HIGH >= 0.70, alert
 * raised at >= 0.70). CRITICAL >= 0.90 is a presentation band only — the
 * backend's own severity enum is authoritative wherever it is supplied.
 * The UI must never disagree with the backend about where a score sits.
 */
export const RISK_THRESHOLDS = { MEDIUM: 0.4, HIGH: 0.7, CRITICAL: 0.9 } as const;

export type RiskBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export function bandFor(probability: number): RiskBand {
  if (probability >= RISK_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (probability >= RISK_THRESHOLDS.HIGH) return 'HIGH';
  if (probability >= RISK_THRESHOLDS.MEDIUM) return 'MEDIUM';
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

export function formatProbability(probability: number): string {
  return `${(probability * 100).toFixed(1)}`;
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
    return { value, source: 'risk_score', band: bandFor(value / 100), derived: false };
  }
  if (typeof fraudProbability === 'number') {
    return {
      value: Math.round(fraudProbability * 100),
      source: 'fraud_probability',
      band: bandFor(fraudProbability),
      derived: true,
    };
  }
  return null;
}

/** Band from a 0–100 score, for callers that already have one. */
export function bandForScore(score: number): RiskBand {
  return bandFor(score / 100);
}
