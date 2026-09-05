import { describe, expect, it } from 'vitest';
import { formatIban, isValidIban, normaliseIban } from '@/lib/iban';
import { formatAmount, formatMoney, isValidAmount, isValidBalance, normaliseAmount } from '@/lib/money';
import { bandFor } from '@/lib/risk';

describe('iban (ISO 13616 mod-97)', () => {
  it('accepts the AE IBANs used by the demo samples', () => {
    expect(isValidIban('AE070331234567890123456')).toBe(true);
    expect(isValidIban('AE460090000000123456789')).toBe(true);
    expect(isValidIban('AE750260001015079880701')).toBe(true);
  });

  it('rejects a single-digit typo that keeps the shape valid', () => {
    // Shape still matches ^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$ — only the
    // checksum catches this, which is the entire point of doing it locally.
    expect(isValidIban('AE070331234567890123457')).toBe(false);
  });

  it('rejects wrong check digits and malformed input', () => {
    expect(isValidIban('AE000331234567890123456')).toBe(false);
    expect(isValidIban('XX')).toBe(false);
    expect(isValidIban('')).toBe(false);
  });

  it('normalises spacing and case before validating', () => {
    expect(normaliseIban('ae07 0331 2345 6789 0123 456')).toBe('AE070331234567890123456');
    expect(isValidIban('ae07 0331 2345 6789 0123 456')).toBe(true);
    expect(formatIban('AE070331234567890123456')).toBe('AE07 0331 2345 6789 0123 456');
  });
});

describe('money (string decimals, never floats)', () => {
  it('accepts amounts with at most two decimal places', () => {
    expect(isValidAmount('18500.00')).toBe(true);
    expect(isValidAmount('0.01')).toBe(true);
    expect(isValidAmount('0')).toBe(false);
    expect(isValidAmount('18500.000')).toBe(false);
    expect(isValidAmount('-5.00')).toBe(false);
  });

  it('allows zero for balances but not for amounts', () => {
    expect(isValidBalance('0.00')).toBe(true);
    expect(isValidAmount('0.00')).toBe(false);
  });

  it('normalises to exactly two decimal places', () => {
    expect(normaliseAmount('100')).toBe('100.00');
    expect(normaliseAmount('100.5')).toBe('100.50');
    expect(normaliseAmount('100.50')).toBe('100.50');
  });

  it('groups digits without going through Number', () => {
    expect(formatAmount('48500.00')).toBe('48,500.00');
    expect(formatAmount('999999999.99')).toBe('999,999,999.99');
    // A value beyond IEEE-754 integer precision must survive intact.
    expect(formatAmount('9007199254740993.01')).toBe('9,007,199,254,740,993.01');
    expect(formatAmount(null)).toBe('—');
    expect(formatMoney('250.00', 'AED')).toBe('250.00 AED');
  });
});

describe('risk bands', () => {
  it('uses the server cut points exactly', () => {
    expect(bandFor(0.399)).toBe('LOW');
    expect(bandFor(0.4)).toBe('MEDIUM');
    expect(bandFor(0.699)).toBe('MEDIUM');
    expect(bandFor(0.7)).toBe('HIGH');
    expect(bandFor(0.899)).toBe('HIGH');
    expect(bandFor(0.9)).toBe('CRITICAL');
    expect(bandFor(1)).toBe('CRITICAL');
  });
});
