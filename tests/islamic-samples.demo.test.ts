import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { transactionCreatedSchema, transactionFormSchema } from '@/api/schemas/transactions';
import { buildTransactionPayload } from '@/features/transactions/payload';
import { SAMPLES } from '@/features/transactions/samples';
import { handlers } from '@/mocks/handlers';

/**
 * MSW demo mode must keep working with the new Islamic samples: every setup
 * transaction and every final transaction, for every one of the fifteen
 * samples, must be accepted by the mocked POST /v1/transactions without
 * crashing. The mock does not emulate the Islamic rules (that is what
 * islamic-samples.live.test.ts is for) — this only proves the fixture-rules
 * handler tolerates the new metadata shape end to end.
 */

const server = setupServer(...handlers);
const BASE = 'http://demo.test';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

async function ingestToken(): Promise<string> {
  const response = await fetch(`${BASE}/v1/auth/client-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: 'ingest-loader',
      client_secret: 'demo-ingest-secret-not-for-production',
    }),
  });
  expect(response.status, 'the demo ingest client could not authenticate').toBe(200);
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

describe('demo mode accepts every Islamic sample', () => {
  it.each(SAMPLES.map((sample) => [sample.id, sample] as const))(
    '%s: setup and final transactions are all accepted',
    async (_id, sample) => {
      const token = await ingestToken();
      const scenario = sample.generate();
      const allTransactions = [...scenario.setup, scenario.final];

      for (const values of allTransactions) {
        const parsed = transactionFormSchema.parse(values);
        const body = buildTransactionPayload(parsed);
        const response = await fetch(`${BASE}/v1/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify(body),
        });
        expect(response.status, `${sample.id} was refused by demo mode`).toBe(201);
        const created = transactionCreatedSchema.parse(await response.json());
        expect(created.transaction_id).toBeTruthy();
      }
    },
  );
});
