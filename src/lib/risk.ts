/**
 * Risk bands on the 0–100 scale, the same cut points as the backend's
 * app/services/risk_bands.py:
 *
 *   Low 0–39 · Medium 40–69 · High 70–100 · Critical 90–100
 *
 * Critical sits inside High: the server's `risk_level` stops at HIGH and uses
 * CRITICAL for alert severity. An alert opens at >= 70, or at any score when the
 * network analyzer returned evidence. The UI must never disagree with the
 * backend about where a score sits.
 */
export const RISK_THRESHOLDS = { MEDIUM: 40, HIGH: 70, CRITICAL: 90 } as const;

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

/**
 * Floored, not rounded: 69.6 is MEDIUM on the server, and printing it as "70"
 * would show a High number on a Medium chip. No epsilon here — a native score
 * of 69.99999999999999 is MEDIUM and must print as 69.
 */
export function formatRiskScore(score: number): string {
  return String(Math.floor(score));
}

/**
 * A 0–1 probability on the 0–100 scale. The epsilon absorbs the binary float
 * error of the multiplication (0.57 * 100 is 56.99999999999999), so it belongs
 * to this conversion only, never to a score that arrived on 0–100.
 */
export function probabilityToScore(probability: number): number {
  return probability * 100 + 1e-9;
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
  /** 0–100, floored like `formatRiskScore`. */
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
    return {
      value: Math.floor(riskScore),
      source: 'risk_score',
      band: bandFor(riskScore),
      derived: false,
    };
  }
  if (typeof fraudProbability === 'number') {
    // Value and band both read the corrected score, so they cannot disagree.
    const score = probabilityToScore(fraudProbability);
    return {
      value: Math.floor(score),
      source: 'fraud_probability',
      band: bandFor(score),
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
