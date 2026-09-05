/**
 * Money never becomes a JS number. `0.1 + 0.2` is the reason; in a
 * financial-crime product a rounding artefact in a demo is fatal to trust.
 * Amounts are strings from the API, stay strings through form state, and are
 * only formatted at the point of display.
 */

const DIGITS_RE = /^\d+$/;

/**
 * Shape check without a regex.
 *
 * A pattern like `^\d{1,10}(\.\d{1,2})?$` is in fact linear, but it trips
 * static ReDoS detectors on its nested quantifier, and this is a codebase that
 * has to survive a security review. Splitting on the decimal point and
 * measuring the two halves is both obviously linear and easier to read.
 */
function hasAmountShape(value: string): boolean {
  const parts = value.split('.');
  if (parts.length > 2) return false;

  const [whole, fraction] = parts;
  if (whole === undefined || whole.length < 1 || whole.length > 10) return false;
  if (!DIGITS_RE.test(whole)) return false;

  if (fraction === undefined) return true;
  if (fraction.length < 1 || fraction.length > 2) return false;
  return DIGITS_RE.test(fraction);
}

/**
 * The comparisons below go through Number deliberately and only to enforce the
 * server's range. The value that is stored and sent is always the original
 * string — no arithmetic is ever performed on it.
 */
export function isValidAmount(value: string): boolean {
  const trimmed = value.trim();
  if (!hasAmountShape(trimmed)) return false;
  return Number(trimmed) > 0 && Number(trimmed) <= 1_000_000_000;
}

/** Same rule but allows zero — balances may legitimately be "0.00". */
export function isValidBalance(value: string): boolean {
  const trimmed = value.trim();
  if (!hasAmountShape(trimmed)) return false;
  return Number(trimmed) >= 0 && Number(trimmed) <= 1_000_000_000;
}

/** Exactly two decimal places, no thousands separators — what the API wants. */
export function normaliseAmount(value: string): string {
  const trimmed = value.trim();
  if (!hasAmountShape(trimmed)) return trimmed;
  const [whole = '0', fraction = ''] = trimmed.split('.');
  return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

/**
 * Insert thousands separators by walking the digits.
 *
 * The usual one-liner for this is `/\B(?=(\d{3})+(?!\d))/g`, which is a
 * lookahead containing a quantified group — superlinear on a long run of
 * digits, and flagged as such by eslint-plugin-security. A backwards walk is
 * linear and works on integers of any length, which matters because these
 * strings are never bounded by IEEE-754 precision.
 */
function groupDigits(whole: string): string {
  if (whole.length <= 3) return whole;
  let out = '';
  for (let index = whole.length; index > 0; index -= 3) {
    const start = Math.max(0, index - 3);
    out = whole.slice(start, index) + (out ? `,${out}` : '');
  }
  return out;
}

/**
 * Group digits for display without ever going through Number.
 * "48500.00" -> "48,500.00"
 */
export function formatAmount(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const [whole = '0', fraction] = value.split('.');
  const decimals = (fraction ?? '').padEnd(2, '0').slice(0, 2);
  return `${groupDigits(whole)}.${decimals}`;
}

export function formatMoney(
  value: string | null | undefined,
  currency: string | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '—';
  return currency ? `${formatAmount(value)} ${currency}` : formatAmount(value);
}
