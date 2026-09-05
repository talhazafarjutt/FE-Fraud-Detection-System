/**
 * ISO 13616 IBAN validation, implemented client-side so a typo is caught on
 * blur instead of after a network round-trip in front of an audience.
 */

const SHAPE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/;

/** mod-97 over an arbitrarily long numeric string — cannot use Number here. */
function mod97(digits: string): number {
  let remainder = 0;
  for (const char of digits) {
    remainder = (remainder * 10 + (char.charCodeAt(0) - 48)) % 97;
  }
  return remainder;
}

export function normaliseIban(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidIbanShape(value: string): boolean {
  return SHAPE.test(normaliseIban(value));
}

export function isValidIban(value: string): boolean {
  const iban = normaliseIban(value);
  if (!SHAPE.test(iban)) return false;
  if (iban.length < 15 || iban.length > 34) return false;

  // Move the first four characters to the end, then map letters to numbers
  // (A=10 ... Z=35). The result mod 97 must be 1.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let numeric = '';
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      numeric += String(code - 55);
    } else if (code >= 48 && code <= 57) {
      numeric += char;
    } else {
      return false;
    }
  }
  return mod97(numeric) === 1;
}

/** Display helper: group in fours, the way a bank statement prints them. */
export function formatIban(value: string): string {
  return normaliseIban(value).replace(/(.{4})/g, '$1 ').trim();
}
