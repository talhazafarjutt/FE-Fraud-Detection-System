import { request, requestData, route } from '../client';
import { parsePageTolerant, type TolerantPage } from '../compat';
import {
  type TrainingRecord,
  type TrainingRecordPatch,
  type TrainingRun,
  type TrainingRunInput,
  type TrainingRunRecord,
  trainingRecordSchema,
  trainingRunRecordSchema,
  trainingRunSchema,
} from '../schemas/training';

export interface TrainingRecordFilters {
  training_status?: string;
  final_label?: string;
  limit?: number;
}

export async function listTrainingRecords(
  filters: TrainingRecordFilters,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<TolerantPage<TrainingRecord>> {
  const payload = await requestData<unknown>(
    route('/v1/training/records', {
      training_status: filters.training_status,
      final_label: filters.final_label,
      limit: filters.limit,
      cursor,
    }),
    { ...(signal ? { signal } : {}) },
  );
  return parsePageTolerant(trainingRecordSchema, payload);
}

export async function getTrainingRecord(
  recordId: string,
  signal?: AbortSignal,
): Promise<TrainingRecord> {
  return requestData(route('/v1/training/records/{record_id}', { record_id: recordId }), {
    schema: trainingRecordSchema,
    ...(signal ? { signal } : {}),
  });
}

/**
 * Only keys the caller set are sent. The endpoint is `extra="forbid"` and
 * rejects `final_label` outright — a label changes by re-concluding the case.
 */
export async function patchTrainingRecord(
  recordId: string,
  patch: TrainingRecordPatch,
): Promise<TrainingRecord> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) body[key] = value;
  }
  return requestData(route('/v1/training/records/{record_id}', { record_id: recordId }), {
    method: 'PATCH',
    body,
    schema: trainingRecordSchema,
  });
}

export async function createTrainingRun(input: TrainingRunInput): Promise<TrainingRun> {
  return requestData(route('/v1/training/runs'), {
    method: 'POST',
    body: {
      name: input.name,
      record_ids: input.record_ids,
      ...(input.notes ? { notes: input.notes } : {}),
    },
    schema: trainingRunSchema,
  });
}

export async function listTrainingRuns(
  cursor: string | null,
  signal?: AbortSignal,
): Promise<TolerantPage<TrainingRun>> {
  const payload = await requestData<unknown>(route('/v1/training/runs', { limit: 50, cursor }), {
    ...(signal ? { signal } : {}),
  });
  return parsePageTolerant(trainingRunSchema, payload);
}

export async function getTrainingRun(runId: string, signal?: AbortSignal): Promise<TrainingRun> {
  return requestData(route('/v1/training/runs/{run_id}', { run_id: runId }), {
    schema: trainingRunSchema,
    ...(signal ? { signal } : {}),
  });
}

export async function listTrainingRunRecords(
  runId: string,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<TolerantPage<TrainingRunRecord>> {
  const payload = await requestData<unknown>(
    route('/v1/training/runs/{run_id}/records', { run_id: runId }, { limit: 200, cursor }),
    { ...(signal ? { signal } : {}) },
  );
  return parsePageTolerant(trainingRunRecordSchema, payload);
}

/** Withdraw a run the ML service has not started. Anything later is a 409. */
export async function cancelTrainingRun(runId: string): Promise<void> {
  await request(route('/v1/training/runs/{run_id}/cancel', { run_id: runId }), {
    method: 'POST',
  });
}
