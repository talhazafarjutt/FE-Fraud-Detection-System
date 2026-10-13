import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ContractRegistration, contractSchema } from '@/api/schemas/contracts';
import { transactionCreatedSchema, transactionFormSchema } from '@/api/schemas/transactions';
import { buildTransactionPayload } from '@/features/transactions/payload';
import { SAMPLES } from '@/features/transactions/samples';
import { handlers } from '@/mocks/handlers';

/**
 * MSW demo mode must keep working with the Islamic samples: every contract
 * registration, setup transaction and final transaction, for every sample, must be accepted by the mocked POST /v1/transactions without
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

async function register(token: string, contract: ContractRegistration): Promise<Response> {
  return fetch(`${BASE}/v1/islamic/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(contract),
  });
}

describe('demo mode accepts every Islamic sample', () => {
  it.each(SAMPLES.map((sample) => [sample.id, sample] as const))(
    '%s: contract registrations, setup and final transactions are all accepted',
    async (_id, sample) => {
      const token = await ingestToken();
      const scenario = sample.generate();
      const allTransactions = [];
      for (const step of scenario.setup) {
        if (step.kind === 'contract') {
          const response = await register(token, step.contract);
          expect(response.status, `${sample.id}: demo mode refused the registration`).toBe(201);
          const registered = contractSchema.parse(await response.json());
          expect(registered.contract_id).toBe(step.contract.contract_id);
        } else {
          allTransactions.push(step.values);
        }
      }
      allTransactions.push(scenario.final);

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
