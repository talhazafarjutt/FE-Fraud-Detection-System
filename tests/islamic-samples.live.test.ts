import { beforeAll, describe, expect, it } from 'vitest';
import { tokenResponseSchema } from '@/api/schemas/auth';
import {
  type ContractDetail,
  type ContractRegistration,
  contractDetailSchema,
} from '@/api/schemas/contracts';
import {
  riskSchema,
  transactionCreatedSchema,
  transactionFormSchema,
  type Risk,
  type TransactionCreated,
  type TransactionFormValues,
} from '@/api/schemas/transactions';
import { buildTransactionPayload } from '@/features/transactions/payload';
import { keptOnVerdict, SAMPLES, type Sample } from '@/features/transactions/samples';

/**
 * Proves every one of the Islamic samples against the LIVE API —
 * not a mock, not a fixture. Skipped unless LIVE_API is set, because it needs
 * a running backend and writes real transactions into its database.
 *
 * Required environment:
 *   LIVE_API              the API's base URL (e.g. http://localhost:8000),
 *                          or any truthy value to default to that address.
 *   LIVE_INGEST_SECRET     the `ingest-loader` client's secret. Locally this
 *                          is DEMO_INGEST_SECRET's default from
 *                          app/core/config.py in the backend repo — passed in
 *                          here, never written into this file.
 *   LIVE_ANALYST_PASSWORD  a password for `analyst@civitas.ai`, which this
 *                          suite also needs: GET /v1/transactions/{id}/score
 *                          requires `transactions:read`, which the ingest
 *                          client does NOT hold (it has transactions:write
 *                          only — see app/core/scopes.py ROLE_SCOPES). The
 *                          local seed (scripts/seed.py) gives every human
 *                          account the same password; this is also passed in
 *                          via env, never written into this file.
 *
 * Run: LIVE_API=http://localhost:8000 LIVE_INGEST_SECRET=... \
 *      LIVE_ANALYST_PASSWORD=... npx vitest run tests/islamic-samples.live.test.ts
 */

const LIVE_API = process.env.LIVE_API;
const BASE =
  LIVE_API && LIVE_API !== '1' && LIVE_API !== 'true' ? LIVE_API.replace(/\/$/, '') : 'http://localhost:8000';

// Keeps every call (setups, finals, polls) comfortably under 120 req/min.
const PACE_MS = 600;
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clientToken(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(`${BASE}/v1/auth/client-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  if (!response.ok) {
    throw new Error(`POST /v1/auth/client-token -> ${response.status}: ${await response.text()}`);
  }
  return tokenResponseSchema.parse(await response.json()).access_token;
}

async function login(username: string, password: string): Promise<string> {
  const response = await fetch(`${BASE}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error(`POST /v1/auth/token -> ${response.status}: ${await response.text()}`);
  }
  return tokenResponseSchema.parse(await response.json()).access_token;
}

async function submitTxn(
  values: TransactionFormValues,
  bearer: string,
): Promise<TransactionCreated> {
  const parsed = transactionFormSchema.parse(values);
  const body = buildTransactionPayload(parsed);
  const response = await fetch(`${BASE}/v1/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`POST /v1/transactions -> ${response.status}: ${JSON.stringify(json)}`);
  }
  return transactionCreatedSchema.parse(json);
}

async function pollScore(transactionId: string, bearer: string, timeoutMs = 30_000): Promise<Risk> {
  const deadline = Date.now() + timeoutMs;
  let delay = 500;
  for (;;) {
    const response = await fetch(`${BASE}/v1/transactions/${transactionId}/score`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (response.status === 200) return riskSchema.parse(await response.json());
    if (response.status !== 404) {
      throw new Error(`GET /v1/transactions/${transactionId}/score -> ${response.status}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`Score for ${transactionId} did not COMPLETE within ${timeoutMs}ms`);
    }
    await sleep(delay);
    delay = Math.min(delay * 2, 4_000);
  }
}

async function registerContract(contract: ContractRegistration, bearer: string): Promise<void> {
  const response = await fetch(`${BASE}/v1/islamic/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(contract),
  });
  if (response.status !== 201) {
    throw new Error(`POST /v1/islamic/contracts -> ${response.status}: ${await response.text()}`);
  }
}

async function readContract(contractId: string, bearer: string): Promise<ContractDetail | null> {
  const response = await fetch(`${BASE}/v1/islamic/contracts/${encodeURIComponent(contractId)}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET /v1/islamic/contracts/${contractId} -> ${response.status}`);
  return contractDetailSchema.parse(await response.json());
}

interface SampleOutcome {
  created: TransactionCreated;
  risk: Risk;
  /** The registration of the contract the final transaction names, if the sample made one. */
  registered: ContractRegistration | undefined;
}

async function runSample(sample: Sample, ingestToken: string, readToken: string): Promise<SampleOutcome> {
  const scenario = sample.generate();
  for (const step of scenario.setup) {
    if (step.kind === 'contract') await registerContract(step.contract, ingestToken);
    else await submitTxn(step.values, ingestToken);
    await sleep(PACE_MS);
  }
  const registered = scenario.setup
    .flatMap((step) => (step.kind === 'contract' ? [step.contract] : []))
    .find((contract) => contract.contract_id === scenario.final.islamic.contract_id);
  const created = await submitTxn(scenario.final, ingestToken);
  await sleep(PACE_MS);

  let risk = created.risk ?? undefined;
  if (created.scoring !== 'COMPLETE' || !risk) {
    risk = await pollScore(created.transaction_id, readToken);
    await sleep(PACE_MS);
  }
  return { created, risk, registered };
}

describe.skipIf(!LIVE_API)('Islamic samples against the live API', () => {
  let ingestToken = '';
  let readToken = '';

  beforeAll(async () => {
    const ingestSecret = process.env.LIVE_INGEST_SECRET;
    if (!ingestSecret) {
      throw new Error('Set LIVE_INGEST_SECRET (the ingest-loader client secret) to run this suite.');
    }
    const analystPassword = process.env.LIVE_ANALYST_PASSWORD;
    if (!analystPassword) {
      throw new Error(
        'Set LIVE_ANALYST_PASSWORD (analyst@civitas.ai\'s password) to run this suite — ' +
          'GET /v1/transactions/{id}/score needs transactions:read, which the ingest client lacks.',
      );
    }
    ingestToken = await clientToken('ingest-loader', ingestSecret);
    readToken = await login('analyst@civitas.ai', analystPassword);
  }, 30_000);

  for (const sample of SAMPLES) {
    it(
      `${sample.id}: ${sample.label}`,
      async () => {
        const { created, risk, registered } = await runSample(sample, ingestToken, readToken);
        const score = risk.risk_score ?? 0;
        const gotAlert = Boolean(created.alert) || score >= 70;
        const findings = risk.layer_findings?.['islamic'];
        const added = [...(findings?.added.map((rule) => rule.rule) ?? [])].sort();
        const setAside = [...(findings?.set_aside.map((rule) => rule.rule) ?? [])].sort();
        const expectedAdded = [...(sample.expected.added ?? [])].sort();
        const expectedSetAside = [...(sample.expected.setAside ?? [])].sort();
        // The samples each name at most one added rule that can vary in
        // severity (TAKAFUL_EARLY_CLAIM, CHARITY_DIVERSION,
        // THIRD_PARTY_REPAYMENT), so the first added rule's severity is the
        // one to compare — there is only ever one when `expected.severity` is set.
        const gotSeverity = findings?.added[0]?.severity ?? null;
        const kept = keptOnVerdict(risk);
        const expectedKept = sample.expected.kept ?? [];

        // eslint-disable-next-line no-console -- the point of this suite is a readable record of the run.
        console.log(
          `${sample.id}: expected alert=${sample.expected.alert} added=[${expectedAdded.join(', ')}]` +
            `${sample.expected.severity ? ` (${sample.expected.severity})` : ''} setAside=[${expectedSetAside.join(', ')}] ` +
            `| got score=${score} alert=${gotAlert} added=[${added.join(', ')}]` +
            `${gotSeverity ? ` (${gotSeverity})` : ''} setAside=[${setAside.join(', ')}]` +
            (expectedKept.length ? ` | kept expected=[${expectedKept.join(', ')}] got=[${kept.join(', ')}]` : ''),
        );

        expect(gotAlert, 'alert').toBe(sample.expected.alert);
        expect(added, 'rules added by the Islamic layer').toEqual(expectedAdded);
        expect(setAside, 'rules the Islamic layer set aside').toEqual(expectedSetAside);
        if (sample.expected.severity) {
          expect(gotSeverity, 'severity of the added rule').toBe(sample.expected.severity);
        }
        // Whatever a set-aside could not touch must still be on the verdict.
        expect(kept, 'still counted on the verdict').toEqual(expect.arrayContaining(expectedKept));
        if (setAside.length > 0) {
          // And the findings record it beside the set-aside.
          const recorded = findings?.kept;
          expect(recorded, 'findings.kept beside a set-aside').toBeTruthy();
          const network = (risk.network?.evidence ?? []).map((evidence) => evidence.code);
          expect(recorded?.network_evidence ?? [], 'findings.kept network evidence').toEqual(network);
        }

        // The register: whether the layer found the contract, and — for one
        // the sample registered — that the analyst sees the payment on it.
        const contractId = findings?.facts.contract_id;
        if (contractId) {
          expect(findings?.facts.contract_registered, 'facts.contract_registered').toBe(
            registered !== undefined,
          );
          expect(findings?.facts.contract_status ?? null, 'facts.contract_status').toBe(
            registered ? (registered.status ?? 'ACTIVE') : null,
          );
        }
        if (registered) {
          const contract = await readContract(registered.contract_id, readToken);
          expect(contract, 'the analyst can read the registered contract').not.toBeNull();
          const payment = contract?.payments.find((p) => p.transaction_id === created.transaction_id);
          expect(payment, 'the final transaction is listed on its contract').toBeTruthy();
          expect([...(payment?.rules_added ?? [])].sort(), 'payment.rules_added').toEqual(added);
          expect([...(payment?.rules_set_aside ?? [])].sort(), 'payment.rules_set_aside').toEqual(setAside);
          // eslint-disable-next-line no-console -- readable record of the run.
          console.log(
            `${sample.id}: contract ${registered.contract_id} ${contract?.status} ` +
              `payments=${contract?.payments.length} schedule=${contract?.schedule.length}`,
          );
        }
      },
      60_000,
    );
  }
});
