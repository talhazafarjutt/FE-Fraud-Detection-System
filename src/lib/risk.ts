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
