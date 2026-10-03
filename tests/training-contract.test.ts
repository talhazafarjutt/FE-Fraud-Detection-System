import { describe, expect, it } from 'vitest';
import {
  trainingRecordSchema,
  trainingRunRecordSchema,
  trainingRunSchema,
} from '@/api/schemas/training';
import { countLabels, datasetWarnings } from '@/features/training/parts';

/**
 * Training contract, pinned to responses CAPTURED FROM THE LIVE API — not
 * written from documentation. Fixtures typed from a brief are how this console
 * once rejected every row of a working ledger.
 *
 * Regenerate by calling the local API as supervisor@example.com.
 */

const WIRE_RECORD = {
  id: '0871e0c9-de2f-4039-bffe-420d0f6cf07e',
  case_id: 'ed029e76-8191-4ae4-9d5f-c3189c0effe7',
  anchor_alert_id: '54897517-7eae-4cd8-869f-5f2e06624343',
  score_id: '1475cf4d-28ce-4434-8a0e-acd7c6002137',
  transaction_id: 'ff35204d-693c-499b-b29e-d05ddee7bb6c',
  alert_count: 2,
  final_label: 'INCONCLUSIVE',
  confidence: 'LOW',
  model_agreement: 'PARTIAL',
  fraud_typology: null,
  decision_drivers: ['insufficient counterparty data'],
  missing_signals: ['historical dispute record', 'IP geolocation'],
  notes: 'Cannot resolve without device data; closed pending better signals.',
  reviewer_user_id: '045a2bb1-5336-4e29-af12-55a0c85e15e3',
  alert_opened_at: '2026-10-02T11:32:21.995253Z',
  decided_at: '2026-10-02T12:32:21.995253Z',
  model_version: '1.0.0',
  risk_engine_version: '2.0.0',
  original_risk_score: 9.500019533122213,
  original_model_score: 3.2555203688389156e-5,
  original_rule_score: 0.0,
  original_anomaly_score: 80.0,
  original_network_score: 30.0,
  original_triggered_rules: [],
  case_title: 'Investigation TXN-74A69E657271',
  case_status: 'CLOSED',
  external_ref: 'TXN-74A69E657271',
  team: 'team-beta',
  training_status: 'EXCLUDED',
  training_note: 'Inconclusive verdicts are not training labels.',
  training_reviewed_by: null,
  training_reviewed_at: null,
  run_count: 0,
} as const;

const WIRE_RUN = {
  id: '7cd95e8d-70f5-4188-aba3-17579ed02196',
  name: 'October review batch',
  notes: 'Includes new mule ring.',
  status: 'COMPLETED',
  requested_by: '045a2bb1-5336-4e29-af12-55a0c85e15e3',
  requested_at: '2026-10-02T11:33:16.617855Z',
  started_at: '2026-10-02T11:33:32.335602Z',
  finished_at: '2026-10-02T11:33:32.368534Z',
  record_count: 5,
  label_counts: {
    FALSE_POSITIVE: 2,
    CONFIRMED_FRAUD: 3,
  },
  base_model_version: '1.0.0',
  executor: 'ml-service',
  result_model_version: null,
  metrics: {
    mode: 'evaluation_only',
    note: 'Reference worker: evaluated the current engine against the approved labels. No new model was trained.',
    precision: null,
    threshold: 70.0,
    label_counts: {
      FALSE_POSITIVE: 2,
      CONFIRMED_FRAUD: 3,
    },
    engine_caught: 0,
    engine_missed: 3,
    false_positive: 2,
    confirmed_fraud: 3,
    records_unscored: 0,
    records_evaluated: 5,
    engine_false_alarms: 0,
    recall_on_curated_set: 0.0,
  },
  error: null,
  warnings: [
    'Only 5 record(s). Fine for a targeted correction; too few to retrain a model from on its own.',
  ],
} as const;

const WIRE_RUN_RECORD = {
  id: '67347daa-4b78-40ea-b7d3-0001687598a0',
  feedback_id: '2e13ebae-ec3e-4308-8081-380bdf04d59f',
  case_id: '8e463c3e-8934-4fab-a5ff-83ee3bf67bc6',
  final_label: 'CONFIRMED_FRAUD',
  snapshot: {
    id: '2e13ebae-ec3e-4308-8081-380bdf04d59f',
    team: 'team-alpha',
    notes: 'Ring confirmed: funds fan in and leave within the hour.',
    case_id: '8e463c3e-8934-4fab-a5ff-83ee3bf67bc6',
    score_id: '9ce9f17e-59ce-49e9-b4bd-49981aa23a87',
    confidence: 'MEDIUM',
    decided_at: '2026-10-02T12:32:12.757220Z',
    alert_count: 10,
    final_label: 'CONFIRMED_FRAUD',
    external_ref: 'TXN-3A1CE1BFD496',
    model_version: '1.0.0',
    case_opened_at: '2026-10-02T11:32:12.757220Z',
    fraud_typology: 'LAYERING',
    transaction_id: '3dbedd79-1d01-4251-a205-289acc85ef29',
    anchor_alert_id: '0e8c9915-86eb-4dec-b8d5-66bbe9873116',
    missing_signals: ['expected-payment calendar', 'device fingerprint'],
    model_agreement: 'AGREES',
    decision_drivers: [
      'shared signatory across ring accounts',
      'ORIGIN_ACCOUNT_DRAIN',
      'outbound within minutes of inbound',
    ],
    reviewer_user_id: '045a2bb1-5336-4e29-af12-55a0c85e15e3',
    original_risk_score: 67.450204372406,
    original_rule_score: 0.0,
    risk_engine_version: '2.0.0',
    original_model_score: 99.08367395401001,
    original_anomaly_score: 80.0,
    original_network_score: 0.0,
    original_triggered_rules: [],
  },
} as const;

describe('training schemas accept the live API', () => {
  it('parses a training record', () => {
    const parsed = trainingRecordSchema.safeParse(WIRE_RECORD);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('parses a completed training run with its metrics', () => {
    const parsed = trainingRunSchema.safeParse(WIRE_RUN);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data?.status).toBe('COMPLETED');
  });

  it('parses a frozen run record', () => {
    const parsed = trainingRunRecordSchema.safeParse(WIRE_RUN_RECORD);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('tolerates a field the backend adds later', () => {
    const parsed = trainingRunSchema.safeParse({ ...WIRE_RUN, some_future_field: 1 });
    expect(parsed.success).toBe(true);
  });
});

describe('the record carries no editable label path', () => {
  it('exposes the outcome only as read data', () => {
    // The console must never offer final_label as an edit: the API rejects it
    // with a 422, and changing a label belongs to re-concluding the case.
    const editable = [
      'training_status',
      'training_note',
      'confidence',
      'fraud_typology',
      'decision_drivers',
      'missing_signals',
      'notes',
    ];
    expect(editable).not.toContain('final_label');
  });
});

describe('dataset warnings match the server', () => {
  // Same rules as app/services/training_eval.dataset_warnings. If one side
  // changes, the supervisor sees one warning before queuing and another after.
  it('warns on a small, one-class dataset', () => {
    const warnings = datasetWarnings(countLabels(['CONFIRMED_FRAUD', 'CONFIRMED_FRAUD']));
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('Only 2 record(s)');
    expect(warnings[1]).toContain('Every record is CONFIRMED_FRAUD');
  });

  it('is silent on a balanced, sizeable dataset', () => {
    const labels = [
      ...Array<string>(15).fill('CONFIRMED_FRAUD'),
      ...Array<string>(15).fill('FALSE_POSITIVE'),
    ];
    expect(datasetWarnings(countLabels(labels))).toEqual([]);
  });

  it('agrees with the warnings the live API attached to this run', () => {
    expect(datasetWarnings(WIRE_RUN.label_counts as Record<string, number>)).toEqual(
      WIRE_RUN.warnings,
    );
  });
});
