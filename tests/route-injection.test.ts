import { describe, expect, it } from 'vitest';
import { alertPageSchema, alertSchema } from '@/api/schemas/alerts';
import { alertRefSchema } from '@/api/schemas/transactions';

/**
 * React Router 6.x carries an open-redirect advisory (GHSA-wrjc-x8rr-h8h6):
 * a backslash in a `<Link to>` or `useNavigate` target can escape the origin.
 * The fix landed in 7.18, and the brief pins v6, so we do not get it.
 *
 * In this codebase every route target is either a hardcoded literal or one of
 * exactly two interpolations — `/alerts/${alert.id}` in AlertRow and
 * `/alerts/${alert.alert_id}` in SubmissionResult. Both values come off the
 * wire, so the advisory is closed only because those fields are validated as
 * UUIDs before they can reach a Link.
 *
 * That makes the Zod schema a security control rather than a convenience.
 * These tests pin it, so nobody loosens `uuid()` to `string()` later and
 * silently reopens the redirect.
 */

function alertWith(id: string) {
  return {
    id,
    transaction_id: '11111111-1111-4111-a111-111111111111',
    status: 'OPEN',
    severity: 'HIGH',
    fraud_probability: 0.8,
    team: 'team-alpha',
    assigned_to: null,
    opened_at: '2026-09-04T10:00:00Z',
    closed_at: null,
    amount: '100.00',
    currency: 'AED',
  };
}

const HOSTILE_IDS = [
  String.raw`\\evil.example`,
  String.raw`\/evil.example`,
  'http://evil.example',
  '//evil.example',
  '../../logout',
  '..%2f..%2fadmin',
  'abc/../../evil',
  '1111-not-a-uuid',
];

describe('route targets cannot be poisoned by a hostile response', () => {
  it.each(HOSTILE_IDS)('rejects alert id %j', (id) => {
    expect(alertSchema.safeParse(alertWith(id)).success).toBe(false);
  });

  it.each(HOSTILE_IDS)('rejects alert_id %j on a transaction result', (id) => {
    expect(alertRefSchema.safeParse({ alert_id: id, status: 'OPEN', severity: 'HIGH' }).success).toBe(
      false,
    );
  });

  it('rejects a whole page when one row carries a hostile id', () => {
    const page = {
      items: [alertWith('22222222-2222-4222-a222-222222222222'), alertWith(String.raw`\\evil.example`)],
      next_cursor: null,
      page_size: 50,
    };
    // One bad row fails the page rather than rendering a poisoned link.
    expect(alertPageSchema.safeParse(page).success).toBe(false);
  });

  it('accepts a well-formed uuid', () => {
    const parsed = alertSchema.safeParse(alertWith('6b4b1ce7-1a91-4aa8-8c80-999c2334494d'));
    expect(parsed.success).toBe(true);
  });

  it('a validated id can never contain a path or scheme separator', () => {
    const id = '6b4b1ce7-1a91-4aa8-8c80-999c2334494d';
    expect(alertSchema.safeParse(alertWith(id)).success).toBe(true);
    for (const char of ['\\', '/', ':', '.', '%', '?', '#']) {
      expect(id).not.toContain(char);
    }
  });
});
