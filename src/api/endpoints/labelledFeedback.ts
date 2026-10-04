import { request, requestBlob, requestData, route } from '../client';
import { parsePageTolerant, type TolerantPage } from '../compat';
import {
  type ExportBatch,
  type ExportBatchInput,
  type ExportBatchRecord,
  type LabelledFeedback,
  type LabelledFeedbackPatch,
  exportBatchRecordSchema,
  exportBatchSchema,
  labelledFeedbackSchema,
} from '../schemas/labelledFeedback';

export interface LabelledFeedbackFilters {
  curation_status?: string;
  final_label?: string;
  limit?: number;
}

export async function listLabelledFeedback(
  filters: LabelledFeedbackFilters,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<TolerantPage<LabelledFeedback>> {
  const payload = await requestData<unknown>(
    route('/v1/labelled-feedback/records', {
      curation_status: filters.curation_status,
      final_label: filters.final_label,
      limit: filters.limit,
      cursor,
    }),
    { ...(signal ? { signal } : {}) },
  );
  return parsePageTolerant(labelledFeedbackSchema, payload);
}

export async function getLabelledFeedback(
  recordId: string,
  signal?: AbortSignal,
): Promise<LabelledFeedback> {
  return requestData(route('/v1/labelled-feedback/records/{record_id}', { record_id: recordId }), {
    schema: labelledFeedbackSchema,
    ...(signal ? { signal } : {}),
  });
}

/**
 * Only keys the caller set are sent. The endpoint is `extra="forbid"` and
 * rejects `final_label` outright — a label changes by re-concluding the case.
 */
export async function curateLabelledFeedback(
  recordId: string,
  patch: LabelledFeedbackPatch,
): Promise<LabelledFeedback> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) body[key] = value;
  }
  return requestData(route('/v1/labelled-feedback/records/{record_id}', { record_id: recordId }), {
    method: 'PATCH',
    body,
    schema: labelledFeedbackSchema,
  });
}

export async function createExportBatch(input: ExportBatchInput): Promise<ExportBatch> {
  return requestData(route('/v1/labelled-feedback/batches'), {
    method: 'POST',
    body: {
      name: input.name,
      record_ids: input.record_ids,
      ...(input.notes ? { notes: input.notes } : {}),
    },
    schema: exportBatchSchema,
  });
}

export async function listExportBatches(
  cursor: string | null,
  signal?: AbortSignal,
): Promise<TolerantPage<ExportBatch>> {
  const payload = await requestData<unknown>(
    route('/v1/labelled-feedback/batches', { limit: 50, cursor }),
    { ...(signal ? { signal } : {}) },
  );
  return parsePageTolerant(exportBatchSchema, payload);
}

export async function getExportBatch(batchId: string, signal?: AbortSignal): Promise<ExportBatch> {
  return requestData(route('/v1/labelled-feedback/batches/{batch_id}', { batch_id: batchId }), {
    schema: exportBatchSchema,
    ...(signal ? { signal } : {}),
  });
}

export async function listExportBatchRecords(
  batchId: string,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<TolerantPage<ExportBatchRecord>> {
  const payload = await requestData<unknown>(
    route(
      '/v1/labelled-feedback/batches/{batch_id}/records',
      { batch_id: batchId },
      { limit: 200, cursor },
    ),
    { ...(signal ? { signal } : {}) },
  );
  return parsePageTolerant(exportBatchRecordSchema, payload);
}

/** Withdraw a batch the ML service has not started. Anything later is a 409. */
export async function cancelExportBatch(batchId: string): Promise<void> {
  await request(route('/v1/labelled-feedback/batches/{batch_id}/cancel', { batch_id: batchId }), {
    method: 'POST',
  });
}

export type BatchDownloadFormat = 'csv' | 'jsonl';

/**
 * The batch's frozen records as a file. People appear as ids only; names are
 * resolved in the console, never written into an export. 409 once cancelled.
 */
export async function downloadExportBatch(
  batchId: string,
  format: BatchDownloadFormat,
): Promise<{ blob: Blob; filename: string }> {
  const result = await requestBlob(
    route('/v1/labelled-feedback/batches/{batch_id}/download', { batch_id: batchId }, { format }),
  );
  return {
    blob: result.blob,
    filename: result.filename ?? `labelled-feedback-${batchId.slice(0, 8)}.${format}`,
  };
}
