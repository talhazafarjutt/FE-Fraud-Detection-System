import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LABEL_CONFIDENCE } from '@/api/schemas/cases';
import type {
  TrainingRecord,
  TrainingRecordPatch,
  TrainingStatus,
} from '@/api/schemas/training';
import { Button, Eyebrow } from '@/components/primitives';
import { ChipInput, Choice, Group } from '@/features/cases/ConcludeModal';
import { formatAbsolute } from '@/lib/format';
import { formatRiskScore } from '@/lib/risk';
import { OutcomeChip, TrainingStatusChip } from './parts';

const DECISIONS: { value: TrainingStatus; title: string; body: string }[] = [
  {
    value: 'APPROVED',
    title: 'Approve for training',
    body: 'A clear, representative outcome. Safe to teach the model.',
  },
  {
    value: 'EXCLUDED',
    title: 'Exclude',
    body: 'Correct verdict, but a poor example to learn from. A reason is required.',
  },
  {
    value: 'CANDIDATE',
    title: 'Back to review',
    body: 'Not decided yet. It will not be used until someone approves it.',
  },
];

export interface RecordEditorProps {
  record: TrainingRecord | null;
  onClose: () => void;
  onSave: (patch: TrainingRecordPatch) => void;
  saving: boolean;
  error?: string | undefined;
}

/**
 * Review one verdict as a training example.
 *
 * Two things are deliberately not editable here, and the screen says why:
 * the OUTCOME (changing it would leave the case and this record disagreeing —
 * reopen the case instead), and the ENGINE SNAPSHOT (it is evidence of what the
 * engine said at the time; evidence is not corrected).
 */
export function RecordEditor({ record, onClose, onSave, saving, error }: RecordEditorProps) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [decision, setDecision] = useState<TrainingStatus>('CANDIDATE');
  const [trainingNote, setTrainingNote] = useState('');
  const [confidence, setConfidence] = useState('');
  const [typology, setTypology] = useState('');
  const [drivers, setDrivers] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!record) return;
    setDecision((record.training_status as TrainingStatus) ?? 'CANDIDATE');
    setTrainingNote(record.training_note ?? '');
    setConfidence(String(record.confidence ?? ''));
    setTypology(record.fraud_typology ?? '');
    setDrivers(record.decision_drivers ?? []);
    setMissing(record.missing_signals ?? []);
    setNotes(record.notes ?? '');
    dialogRef.current?.focus();
  }, [record]);

  useEffect(() => {
    if (!record) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [record, onClose]);

  if (!record) return null;

  const inconclusive = record.final_label === 'INCONCLUSIVE';
  const needsReason = decision === 'EXCLUDED' && !trainingNote.trim();

  // Send only what actually changed: the audit trail records every field in
  // the request, and "changed X from A to A" buries the edits that matter.
  const patch: TrainingRecordPatch = {};
  if (decision !== record.training_status) patch.training_status = decision;
  if (trainingNote !== (record.training_note ?? '')) patch.training_note = trainingNote;
  if (confidence && confidence !== String(record.confidence)) patch.confidence = confidence;
  if (typology !== (record.fraud_typology ?? '')) patch.fraud_typology = typology;
  if (JSON.stringify(drivers) !== JSON.stringify(record.decision_drivers ?? []))
    patch.decision_drivers = drivers;
  if (JSON.stringify(missing) !== JSON.stringify(record.missing_signals ?? []))
    patch.missing_signals = missing;
  if (notes !== (record.notes ?? '')) patch.notes = notes;
  const dirty = Object.keys(patch).length > 0;

  const rules = (record.original_triggered_rules ?? []).map((r) => r.rule);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(0,0,0,0.55)] p-4 sm:p-8">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="w-full max-w-3xl border border-rule bg-paper"
      >
        <header className="border-b border-rule p-6">
          <Eyebrow className="!mb-2">Review for training</Eyebrow>
          <h2 id={headingId} className="mb-3">
            {record.case_title ?? 'Investigation'}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <OutcomeChip label={String(record.final_label)} />
            <TrainingStatusChip status={String(record.training_status)} />
            <Link
              to={`/cases/${record.case_id}`}
              className="font-mono text-[11px] uppercase tracking-label text-ultra hover:underline"
            >
              Open case →
            </Link>
          </div>
        </header>

        <div className="space-y-8 p-6">
          {/* --- What the engine said: read-only evidence ------------------ */}
          <section>
            <Eyebrow className="!mb-2">What the engine said when the human decided</Eyebrow>
            <p className="mb-3 text-[12px] text-ink-3">
              Recorded at the moment of the verdict. Read-only — evidence is not corrected.
            </p>
            <dl className="grid gap-px border border-rule bg-rule sm:grid-cols-5">
              <Fact label="Risk" value={score(record.original_risk_score)} strong />
              <Fact label="Model" value={score(record.original_model_score)} />
              <Fact label="Rules" value={score(record.original_rule_score)} />
              <Fact label="Anomaly" value={score(record.original_anomaly_score)} />
              <Fact label="Network" value={score(record.original_network_score)} />
            </dl>
            <p className="mt-3 text-[12px] text-ink-2">
              {rules.length ? `Rules fired: ${rules.join(', ')}. ` : 'No rule fired. '}
              Engine agreement recorded by the investigator:{' '}
              <strong>{String(record.model_agreement)}</strong>. Model{' '}
              {record.model_version ?? '—'}, engine {record.risk_engine_version ?? '—'}. Decided{' '}
              {formatAbsolute(record.decided_at)}.
            </p>
          </section>

          {/* --- The training decision ------------------------------------- */}
          <Group
            legend="Training decision"
            required
            hint={
              inconclusive
                ? 'An inconclusive verdict is not a label and cannot be approved. Reopen the case if it has since been resolved.'
                : 'Is this verdict a good example for the model to learn from?'
            }
          >
            <div className="grid gap-px bg-rule sm:grid-cols-3">
              {DECISIONS.map((option) => (
                <Choice
                  key={option.value}
                  name="training_status"
                  selected={decision === option.value}
                  disabled={inconclusive && option.value === 'APPROVED'}
                  onSelect={() => setDecision(option.value)}
                  title={option.title}
                  body={option.body}
                />
              ))}
            </div>
          </Group>

          <Group
            legend="Reason"
            required={decision === 'EXCLUDED'}
            hint="Why you approved or excluded it. Required to exclude — an unexplained exclusion looks, a year later, like data someone dropped because it was inconvenient."
          >
            <textarea
              className="field min-h-20"
              maxLength={2000}
              value={trainingNote}
              onChange={(event) => setTrainingNote(event.target.value)}
            />
          </Group>

          {/* --- Corrections to supporting detail --------------------------- */}
          <div className="border-t border-rule pt-6">
            <Eyebrow className="!mb-2">Correct the supporting detail</Eyebrow>
            <p className="mb-6 max-w-2xl text-[12px] text-ink-3">
              The outcome itself ({String(record.final_label).replace(/_/g, ' ')}) is not editable
              here. Changing it would leave the case and this record disagreeing — reopen the case
              and conclude it again, and it will come back here for review.
            </p>

            <div className="space-y-8">
              <Group legend="Confidence">
                <div className="grid gap-px bg-rule sm:grid-cols-3">
                  {LABEL_CONFIDENCE.map((value) => (
                    <Choice
                      key={value}
                      name="confidence"
                      selected={confidence === value}
                      onSelect={() => setConfidence(value)}
                      title={value}
                    />
                  ))}
                </div>
              </Group>

              <Group legend="Typology" hint="The shape of the scheme, e.g. MULE_RING.">
                <input
                  className="field"
                  maxLength={64}
                  value={typology}
                  onChange={(event) => setTypology(event.target.value)}
                />
              </Group>

              <Group legend="What drove the decision">
                <ChipInput
                  values={drivers}
                  onChange={setDrivers}
                  placeholder="network fan-in"
                  limit={20}
                />
              </Group>

              <Group legend="What was missing">
                <ChipInput
                  values={missing}
                  onChange={setMissing}
                  placeholder="device fingerprint"
                  limit={20}
                />
              </Group>

              <Group legend="Investigator notes">
                <textarea
                  className="field min-h-20"
                  maxLength={2000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Group>
            </div>
          </div>

          {(record.run_count ?? 0) > 0 ? (
            <p className="border border-rule px-3 py-2 text-[12px] text-ink-2">
              Already used in {record.run_count} training run
              {record.run_count === 1 ? '' : 's'}. Editing it here does not change what those runs
              trained on — each run froze its own copy.
            </p>
          ) : null}

          {error ? (
            <p className="border border-carmine px-3 py-2 text-carmine" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-rule p-6">
          <p className="text-[12px] text-ink-3">
            {needsReason
              ? 'Excluding requires a reason.'
              : dirty
                ? 'Every change is recorded in the audit trail.'
                : 'No changes yet.'}
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => onSave(patch)} disabled={!dirty || needsReason || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function score(value: number | null | undefined): string {
  return typeof value === 'number' ? formatRiskScore(value) : '—';
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-surface p-3">
      <dt className="mono-label text-ink-3">{label}</dt>
      <dd className={strong ? 'font-mono text-[20px] text-ink' : 'font-mono text-[15px] text-ink-2'}>
        {value}
      </dd>
    </div>
  );
}
