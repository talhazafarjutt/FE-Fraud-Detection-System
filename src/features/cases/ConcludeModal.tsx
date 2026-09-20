import { useEffect, useId, useRef, useState } from 'react';
import {
  FINAL_LABELS,
  LABEL_CONFIDENCE,
  MODEL_AGREEMENT,
  type FeedbackInput,
  type FinalLabel,
  type LabelConfidence,
  type ModelAgreement,
} from '@/api/schemas/cases';
import { Button, Eyebrow, cx } from '@/components/primitives';

/**
 * Concluding an investigation.
 *
 * A modal form rather than a status dropdown, deliberately: the label is the
 * point of concluding, not a side effect of it. The server agrees — a verdict
 * status without a feedback block is a 409.
 *
 * NOTHING IS PRE-FILLED. A pre-selected label is a guess recorded as human
 * judgement, and this record becomes a training label for the next model. The
 * cost of a wrong confident label is higher than the cost of three more clicks.
 *
 * The verdict covers the WHOLE case — every member alert — which is why the
 * alert count is stated on the button and in the heading. One scheme produces
 * one label, not one per alert; nine correlated labels for a single event skew
 * the next model.
 */

const LABEL_COPY: Record<FinalLabel, { title: string; body: string }> = {
  CONFIRMED_FRAUD: {
    title: 'Confirmed fraud',
    body: 'You established that this was fraud.',
  },
  FALSE_POSITIVE: {
    title: 'False positive',
    body: 'The activity was legitimate. The engine was wrong to flag it.',
  },
  INCONCLUSIVE: {
    title: 'Inconclusive',
    body: 'You could not establish either way. Recorded honestly rather than forced into a guess.',
  },
};

const AGREEMENT_COPY: Record<ModelAgreement, string> = {
  AGREES: 'The engine reached the same conclusion for reasons that hold up.',
  PARTIAL: 'Right answer, partly wrong reasons — or right for one signal only.',
  DISAGREES: 'The engine was wrong, or was right by accident.',
};

export interface ConcludeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (status: FinalLabel, feedback: FeedbackInput) => void;
  submitting: boolean;
  alertCount: number;
  caseTitle: string;
  /** Statuses the server will accept from the case's current state. */
  allowedLabels: readonly FinalLabel[];
  error?: string | undefined;
}

export function ConcludeModal({
  open,
  onClose,
  onSubmit,
  submitting,
  alertCount,
  caseTitle,
  allowedLabels,
  error,
}: ConcludeModalProps) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [label, setLabel] = useState<FinalLabel | null>(null);
  const [confidence, setConfidence] = useState<LabelConfidence | null>(null);
  const [agreement, setAgreement] = useState<ModelAgreement | null>(null);
  const [typology, setTypology] = useState('');
  const [drivers, setDrivers] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  // Reset on each open: a half-filled form from a previous case is exactly the
  // kind of carry-over that produces a wrong label.
  useEffect(() => {
    if (!open) return;
    setLabel(null);
    setConfidence(null);
    setAgreement(null);
    setTypology('');
    setDrivers([]);
    setMissing([]);
    setNotes('');
    dialogRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const complete = label !== null && confidence !== null && agreement !== null;

  const submit = () => {
    if (!complete) return;
    onSubmit(label, {
      final_label: label,
      confidence,
      model_agreement: agreement,
      ...(typology.trim() ? { fraud_typology: typology.trim().slice(0, 64) } : {}),
      decision_drivers: drivers,
      missing_signals: missing,
      ...(notes.trim() ? { notes: notes.trim().slice(0, 2000) } : {}),
    });
  };

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
          <Eyebrow className="!mb-2">Conclude investigation</Eyebrow>
          <h2 id={headingId} className="mb-2">
            {caseTitle}
          </h2>
          <p className="text-ink-2">
            This verdict covers{' '}
            <strong>
              {alertCount} alert{alertCount === 1 ? '' : 's'}
            </strong>{' '}
            — the whole scheme, judged once. It is recorded in the audit trail and exported as a
            single training label.
          </p>
        </header>

        <div className="space-y-8 p-6">
          <Group
            legend="Outcome"
            required
            hint="What you actually established. Required."
          >
            <div className="grid gap-px bg-rule sm:grid-cols-3">
              {FINAL_LABELS.map((value) => {
                const permitted = allowedLabels.includes(value);
                return (
                  <Choice
                    key={value}
                    name="final_label"
                    selected={label === value}
                    disabled={!permitted}
                    onSelect={() => setLabel(value)}
                    title={LABEL_COPY[value].title}
                    body={
                      permitted
                        ? LABEL_COPY[value].body
                        : 'Not a legal move from this case’s current status.'
                    }
                  />
                );
              })}
            </div>
          </Group>

          <Group
            legend="Confidence"
            required
            hint="Lets retraining down-weight a hesitant label instead of treating every label as equal. Required."
          >
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

          <Group
            legend="Did the engine get it right?"
            required
            hint="Divergence is the leading indicator of drift: a model that is right for the wrong reasons fails on the next variation. Required."
          >
            <div className="grid gap-px bg-rule sm:grid-cols-3">
              {MODEL_AGREEMENT.map((value) => (
                <Choice
                  key={value}
                  name="model_agreement"
                  selected={agreement === value}
                  onSelect={() => setAgreement(value)}
                  title={value}
                  body={AGREEMENT_COPY[value]}
                />
              ))}
            </div>
          </Group>

          <Group legend="Typology" hint="Optional. The shape of the scheme, e.g. MULE_RING.">
            <input
              className="field"
              maxLength={64}
              placeholder="MULE_RING"
              value={typology}
              onChange={(event) => setTypology(event.target.value)}
            />
          </Group>

          <Group
            legend="What drove the decision"
            hint="Optional. Compared against the engine's own explanation during retraining."
          >
            <ChipInput
              values={drivers}
              onChange={setDrivers}
              placeholder="network fan-in"
              limit={20}
            />
          </Group>

          <Group
            legend="What was missing"
            hint="Optional. Signals you wanted and did not have — this is how the next model gets better inputs."
          >
            <ChipInput
              values={missing}
              onChange={setMissing}
              placeholder="device fingerprint"
              limit={20}
            />
          </Group>

          <Group legend="Notes" hint="Optional. Free text, up to 2000 characters.">
            <textarea
              className="field min-h-24"
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Group>

          {error ? (
            <p className="border border-carmine px-3 py-2 text-carmine" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-rule p-6">
          <p className="text-[12px] text-ink-3">
            {complete
              ? 'Outcome, confidence and agreement recorded.'
              : 'Outcome, confidence and agreement are all required.'}
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!complete || submitting}>
              {submitting
                ? 'Recording…'
                : `Conclude ${alertCount} alert${alertCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Group({
  legend,
  hint,
  required,
  children,
}: {
  legend: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="eyebrow !mb-2">
        {legend}
        {required ? <span className="ml-1 text-carmine">*</span> : null}
      </legend>
      {hint ? <p className="mb-3 max-w-2xl text-[12px] text-ink-3">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

function Choice({
  name,
  selected,
  disabled,
  onSelect,
  title,
  body,
}: {
  name: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  body?: string;
}) {
  return (
    <label
      className={cx(
        'block bg-surface p-4',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        selected && 'outline outline-2 -outline-offset-2 outline-[var(--ultra)]',
      )}
    >
      {/*
        The visible text lives in the spans below, which a wrapping <label>
        does not reliably turn into an accessible name for a visually hidden
        input — screen readers announced these as an unnamed "radio". The
        explicit label is what makes each option speakable.
      */}
      <input
        type="radio"
        name={name}
        className="sr-only"
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        aria-label={body ? `${title}. ${body}` : title}
      />
      <span
        className={cx(
          'block font-mono text-[11px] uppercase tracking-label',
          selected ? 'text-ultra' : 'text-ink',
        )}
      >
        {title}
      </span>
      {body ? <span className="mt-2 block text-[12px] text-ink-2">{body}</span> : null}
    </label>
  );
}

/** Multi-entry chips: Enter adds, × removes. */
function ChipInput({
  values,
  onChange,
  placeholder,
  limit,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  limit: number;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    if (!value || values.includes(value) || values.length >= limit) return;
    onChange([...values, value.slice(0, 120)]);
    setDraft('');
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="field"
          placeholder={placeholder}
          value={draft}
          maxLength={120}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button variant="ghost" onClick={add} disabled={!draft.trim() || values.length >= limit}>
          Add
        </Button>
      </div>
      {values.length ? (
        <ul className="flex flex-wrap gap-2">
          {values.map((value) => (
            <li key={value}>
              <button
                type="button"
                className="tag hover:border-carmine hover:text-carmine"
                onClick={() => onChange(values.filter((v) => v !== value))}
                aria-label={`Remove ${value}`}
              >
                {value} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
