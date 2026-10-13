import { registerContract } from '@/api/endpoints/islamic';
import { createTransaction } from '@/api/endpoints/transactions';
import { transactionFormSchema } from '@/api/schemas/transactions';
import { buildTransactionPayload } from './payload';
import type { SetupStep } from './samples';

/**
 * Runs a sample's setup steps in order — contract registrations and
 * transactions — under the ingest session's bearer, the only one holding
 * transactions:write. Strictly sequential (a transaction may name a contract
 * registered one step earlier, and the network analyzer refuses an
 * out-of-order booking), and the first refusal stops the rest.
 */

export class SetupStepError extends Error {
  readonly step: SetupStep;
  readonly index: number;
  readonly failure: unknown;

  constructor(step: SetupStep, index: number, failure: unknown) {
    super(failure instanceof Error ? failure.message : 'A setup step was refused.');
    this.name = 'SetupStepError';
    this.step = step;
    this.index = index;
    this.failure = failure;
  }
}

/** What a step is, for a progress line or an error title. */
export function stepNoun(step: SetupStep): string {
  return step.kind === 'contract' ? 'contract registration' : 'setup transaction';
}

export async function runSetup(
  steps: readonly SetupStep[],
  bearer: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  for (const [index, step] of steps.entries()) {
    try {
      if (step.kind === 'contract') {
        await registerContract(step.contract, bearer);
      } else {
        const body = buildTransactionPayload(transactionFormSchema.parse(step.values));
        await createTransaction(body, crypto.randomUUID(), bearer);
      }
    } catch (error) {
      throw new SetupStepError(step, index, error);
    }
    onProgress?.(index + 1, steps.length);
  }
}
