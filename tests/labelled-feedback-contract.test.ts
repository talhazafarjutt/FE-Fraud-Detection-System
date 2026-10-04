import { describe, expect, it } from 'vitest';
import type { components } from '@/api/schema';
import { parsePageTolerant } from '@/api/compat';
import { metricsOverviewSchema } from '@/api/schemas/metrics';
import {
  type BatchMetrics,
  type LabelledFeedbackPatch,
  BATCH_STATUSES,
  CURATION_STATUSES,
  exportBatchRecordSchema,
  exportBatchSchema,
  labelledFeedbackSchema,
} from '@/api/schemas/labelledFeedback';
import {
  BATCH_STATUS_LABEL,
  CURATION_STATUS_LABEL,
  countLabels,
  datasetWarnings,
} from '@/features/labelled-feedback/parts';
import { RISK_THRESHOLDS } from '@/lib/risk';
import { WIRE_BATCH, WIRE_BATCH_RECORD, WIRE_RECORDS_PAGE } from './wire';

/**
 * Labelled feedback contract, pinned to responses CAPTURED FROM THE LOCAL API —
 * not written from documentation. Fixtures typed from a brief are how this
 * console once rejected every row of a working ledger.
 *
 * Regenerate by calling the local API as supervisor@example.com: the records
 * list, one record, the batches list, a batch, its records, a 409 from creating
 * a batch with a PENDING record, and /v1/metrics/overview (series trimmed).
 */

const WIRE_CONFLICT = {
  type: 'https://fraud.example/errors/conflict',
  title: 'Conflict',
  status: 409,
  detail: 'Only VALIDATED records can be exported. Validate these first.',
  instance: '/v1/labelled-feedback/batches',
  request_id: 'c3ca17aa7e7245d3974fe7f93dcee942',
  not_validated: [
    {
      id: '11c70075-b689-4c3a-bfce-86313e6c28c0',
      curation_status: 'PENDING',
    },
  ],
} as const;

const WIRE_METRICS = {
  window: {
    from: '2026-09-04T10:15:54.393640+00:00',
    to: '2026-10-04T10:15:54.393640+00:00',
    bucket: 'day',
  },
  totals: {
    transactions: 414,
    scored: 414,
    pending: 0,
    alerted: 69,
    alert_rate: 0.1667,
    total_amount: '1238118.15',
    flagged_amount: '507443.87',
    currency: 'AED',
  },
  by_risk_level: {
    MEDIUM: 8,
    HIGH: 1,
    LOW: 405,
  },
  by_alert_status: {
    OPEN: 4,
    CONFIRMED_FRAUD: 37,
    FALSE_POSITIVE: 3,
    ESCALATED: 12,
    IN_REVIEW: 13,
  },
  by_transaction_type: {
    PAYMENT: 63,
    TRANSFER: 97,
    CASH_IN: 76,
    DEBIT: 93,
    CASH_OUT: 85,
  },
  series: [
    {
      t: '2026-10-02T00:00:00+00:00',
      transactions: 30,
      alerts: 18,
      confirmed_fraud: 8,
      false_positives: 0,
      flagged_amount: '126714.79',
    },
    {
      t: '2026-10-03T00:00:00+00:00',
      transactions: 29,
      alerts: 18,
      confirmed_fraud: 17,
      false_positives: 0,
      flagged_amount: '312264.19',
    },
  ],
  outcomes: {
    confirmed_fraud: 6,
    false_positives: 3,
    still_open: 9,
    precision: 0.6667,
    precision_note: 'confirmed / (confirmed + false positives), counted per case over concluded cases only. Recall is not reported: it requires false negatives, which are by definition the frauds this system never flagged and therefore cannot count.',
  },
  latency: {
    mean_ms: 15.9,
    max_ms: 31,
    model_version: '1.0.0',
  },
  queue_health: {
    pending_scores: 0,
    oldest_pending_at: null,
  },
  thresholds: {
    medium_at: 40.0,
    high_at: 70.0,
    critical_at: 90.0,
    alert_at: 70.0,
  },
} as const;

/**
 * The same batch after the reference worker (scripts/ml_export_worker.py)
 * processed it: its metrics are app.services.engine_check run on the frozen
 * records. `team: null` — a cross-team supervisor created it.
 */
const COMPLETED_BATCH = {
  id: 'afe4f9a0-4cdb-4de3-a18f-202cfeaa38a1',
  name: 'October validated labels',
  notes: 'Mule ring plus one payroll false alarm.',
  status: 'COMPLETED',
  requested_by: 'c8684733-a3ec-4cea-a174-00fc0070012f',
  team: null,
  requested_at: '2026-10-04T09:38:15.500098Z',
  started_at: '2026-10-04T10:14:20.550553Z',
  finished_at: '2026-10-04T10:14:20.585108Z',
  record_count: 3,
  label_counts: {
    FALSE_POSITIVE: 1,
    CONFIRMED_FRAUD: 2,
  },
  base_model_version: '1.0.0',
  processed_by: 'ml-service',
  candidate_model_version: null,
  metrics: {
    mode: 'engine_check',
    note: 'Reference worker: checked the current engine against the validated labels. No model was changed.',
    precision: null,
    threshold: 70.0,
    label_counts: {
      FALSE_POSITIVE: 1,
      CONFIRMED_FRAUD: 2,
    },
    engine_caught: 0,
    engine_missed: 2,
    false_positive: 1,
    confirmed_fraud: 2,
    records_unscored: 0,
    records_evaluated: 3,
    engine_false_alarms: 0,
    recall_on_curated_set: 0.0,
  },
  error: null,
  warnings: [
    'Only 3 record(s). Fine for a targeted check; too few to draw conclusions from on its own.',
  ],
} as const;

describe('labelled feedback schemas accept the live API', () => {
  it('parses every row of the records page', () => {
    const page = parsePageTolerant(labelledFeedbackSchema, WIRE_RECORDS_PAGE);
    expect(page.skipped).toBe(0);
    expect(page.items.map((r) => r.curation_status)).toEqual(['EXCLUDED', 'PENDING', 'VALIDATED']);
  });

  it('parses a validated record with its curation fields', () => {
    const parsed = labelledFeedbackSchema.safeParse(WIRE_RECORDS_PAGE.items[2]);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data?.curated_by).toBe('c8684733-a3ec-4cea-a174-00fc0070012f');
    expect(parsed.data?.batch_count).toBe(1);
  });

  it('parses a queued export batch', () => {
    const parsed = exportBatchSchema.safeParse(WIRE_BATCH);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data?.processed_by).toBeNull();
    expect(parsed.data?.candidate_model_version).toBeNull();
  });

  it('parses a completed batch with engine check metrics', () => {
    const parsed = exportBatchSchema.safeParse(COMPLETED_BATCH);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect((parsed.data?.metrics as BatchMetrics | undefined)?.mode).toBe('engine_check');
  });

  it('parses a frozen batch record', () => {
    const parsed = exportBatchRecordSchema.safeParse(WIRE_BATCH_RECORD);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('accepts a batch with no owning team', () => {
    const parsed = exportBatchSchema.parse(COMPLETED_BATCH);
    expect(parsed.team).toBeNull();
  });

  it('carries the case opening time, not an alert one', () => {
    const parsed = labelledFeedbackSchema.parse(WIRE_RECORDS_PAGE.items[0]);
    expect(parsed.case_opened_at).toBe('2026-10-03T19:55:49.556411Z');
    expect('alert_opened_at' in WIRE_RECORDS_PAGE.items[0]).toBe(false);
  });

  it('tolerates a field the backend adds later', () => {
    expect(exportBatchSchema.safeParse({ ...WIRE_BATCH, some_future_field: 1 }).success).toBe(true);
  });
});

describe('curation vocabulary', () => {
  it('names every status the API can send', () => {
    type Generated = components['schemas']['CurationStatus'];
    const all: Record<Generated, true> = { PENDING: true, VALIDATED: true, EXCLUDED: true };
    expect([...CURATION_STATUSES].sort()).toEqual(Object.keys(all).sort());
    expect(CURATION_STATUS_LABEL).toEqual({
      PENDING: 'Awaiting validation',
      VALIDATED: 'Validated',
      EXCLUDED: 'Excluded',
    });
  });

  it('names every batch status the API can send', () => {
    type Generated = components['schemas']['ExportBatchStatus'];
    const all: Record<Generated, true> = {
      QUEUED: true,
      PROCESSING: true,
      COMPLETED: true,
      FAILED: true,
      CANCELLED: true,
    };
    expect([...BATCH_STATUSES].sort()).toEqual(Object.keys(all).sort());
    expect(Object.values(BATCH_STATUS_LABEL)).toEqual([
      'Queued',
      'Processing',
      'Completed',
      'Failed',
      'Cancelled',
    ]);
  });

  it('the patch has the same keys as the API, and no label', () => {
    // A type-level check: drift in either direction fails `tsc`. The label is
    // changed by re-concluding the case, never here.
    type Generated = keyof components['schemas']['LabelledFeedbackPatch'];
    type Ours = keyof LabelledFeedbackPatch;
    const same: [Generated] extends [Ours] ? ([Ours] extends [Generated] ? true : never) : never =
      true;
    const noLabel: 'final_label' extends Ours ? never : true = true;
    expect(same && noLabel).toBe(true);
  });

  it('a batch of unvalidated records is refused with not_validated', () => {
    expect(WIRE_CONFLICT.status).toBe(409);
    expect(WIRE_CONFLICT.not_validated[0]?.curation_status).toBe('PENDING');
  });
});

describe('dataset warnings match the server', () => {
  // Same rules as app/services/engine_check.dataset_warnings. If one side
  // changes, the supervisor sees one warning before queuing and another after.
  it('warns on a small, one-class batch', () => {
    const warnings = datasetWarnings(countLabels(['CONFIRMED_FRAUD', 'CONFIRMED_FRAUD']));
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('Only 2 record(s)');
    expect(warnings[1]).toContain('Every record is CONFIRMED_FRAUD');
  });

  it('is silent on a balanced, sizeable batch', () => {
    const labels = [
      ...Array<string>(15).fill('CONFIRMED_FRAUD'),
      ...Array<string>(15).fill('FALSE_POSITIVE'),
    ];
    expect(datasetWarnings(countLabels(labels))).toEqual([]);
  });

  it('agrees with the warnings the live API attached to this batch', () => {
    expect(datasetWarnings(WIRE_BATCH.label_counts)).toEqual(WIRE_BATCH.warnings);
  });
});

describe('metrics overview thresholds', () => {
  it('parses the live payload', () => {
    const parsed = metricsOverviewSchema.safeParse(WIRE_METRICS);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('keeps the latency and queue figures the server actually sends', () => {
    const parsed = metricsOverviewSchema.parse(WIRE_METRICS);
    expect(parsed.latency).toEqual({ mean_ms: 15.9, max_ms: 31, model_version: '1.0.0' });
    expect(parsed.queue_health).toEqual({ pending_scores: 0, oldest_pending_at: null });

    const backlog = metricsOverviewSchema.parse({
      ...WIRE_METRICS,
      queue_health: { pending_scores: 2, oldest_pending_at: '2026-10-04T10:05:00+00:00' },
    });
    expect(backlog.queue_health.oldest_pending_at).toBe('2026-10-04T10:05:00+00:00');
  });

  it('sits on the same 0-100 cut points as the console', () => {
    expect(WIRE_METRICS.thresholds).toEqual({
      medium_at: RISK_THRESHOLDS.MEDIUM,
      high_at: RISK_THRESHOLDS.HIGH,
      critical_at: RISK_THRESHOLDS.CRITICAL,
      alert_at: RISK_THRESHOLDS.HIGH,
    });
  });
});
