import { describe, expect, it } from 'vitest';
import { parseProblem } from '@/lib/problem';

function problemResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  });
}

describe('RFC 9457 problem+json parsing', () => {
  it('reads the standard members', async () => {
    const parsed = await parseProblem(
      problemResponse(403, {
        type: 'https://fraud.example/errors/insufficient-scope',
        title: 'Insufficient scope',
        status: 403,
        detail: 'The token does not grant the required scope.',
        instance: '/v1/transactions',
      }),
    );
    expect(parsed.status).toBe(403);
    expect(parsed.title).toBe('Insufficient scope');
    expect(parsed.detail).toBe('The token does not grant the required scope.');
  });

  it('keeps non-standard members so the UI can surface them', async () => {
    const parsed = await parseProblem(
      problemResponse(409, {
        title: 'Illegal transition',
        status: 409,
        detail: 'OPEN cannot move to CLOSED.',
        allowed_transitions: ['IN_REVIEW', 'ESCALATED'],
      }),
    );
    expect(parsed.extras['allowed_transitions']).toEqual(['IN_REVIEW', 'ESCALATED']);
  });

  it('reads Retry-After for the login lockout message', async () => {
    const parsed = await parseProblem(
      problemResponse(429, { title: 'Too many requests', status: 429, detail: 'Slow down.' }, { 'Retry-After': '42' }),
    );
    expect(parsed.retryAfter).toBe(42);
  });

  it('flattens a FastAPI validation detail array into one sentence', async () => {
    const parsed = await parseProblem(
      problemResponse(422, {
        detail: [
          { loc: ['body', 'amount'], msg: 'value is not a valid decimal', type: 'value_error' },
          { loc: ['body', 'currency'], msg: 'must be AED', type: 'value_error' },
        ],
      }),
    );
    expect(parsed.detail).toBe('amount: value is not a valid decimal; currency: must be AED');
  });

  it('survives a non-JSON body instead of throwing', async () => {
    const parsed = await parseProblem(new Response('<html>502</html>', { status: 502 }));
    expect(parsed.status).toBe(502);
    expect(parsed.title).toBe('Service unavailable');
  });
});
