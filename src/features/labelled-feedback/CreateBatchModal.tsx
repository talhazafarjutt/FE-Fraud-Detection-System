import { useEffect, useId, useRef, useState } from 'react';
import type { LabelledFeedback } from '@/api/schemas/labelledFeedback';
import { Button, Eyebrow } from '@/components/primitives';
import { Group } from '@/features/cases/ConcludeModal';
import { countLabels, datasetWarnings, OutcomeChip } from './parts';

export interface CreateBatchModalProps {
  records: LabelledFeedback[] | null;
  onClose: () => void;
  onSubmit: (input: { name: string; notes: string }) => void;
  submitting: boolean;
  error?: string | undefined;
}

/**
 * Freeze exactly these validated records into an export batch.
 *
 * The selection is frozen the moment this is submitted. Editing or re-concluding
 * any of these verdicts later changes the live record, never what this batch
 * contains — so "which labels were exported?" always has one answer.
 */
export function CreateBatchModal({
  records,
  onClose,
  onSubmit,
  submitting,
  error,
}: CreateBatchModalProps) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!records) return;
    setName('');
    setNotes('');
    dialogRef.current?.focus();
  }, [records]);

  useEffect(() => {
    if (!records) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [records, onClose]);

  if (!records) return null;

  const counts = countLabels(records.map((r) => String(r.final_label)));
  const warnings = datasetWarnings(counts);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(0,0,0,0.55)] p-4 sm:p-8">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="w-full max-w-2xl border border-rule bg-paper"
      >
        <header className="border-b border-rule p-6">
          <Eyebrow className="!mb-2">Create export batch</Eyebrow>
          <h2 id={headingId} className="mb-2">
            Export {records.length} validated record{records.length === 1 ? '' : 's'}
          </h2>
          <p className="text-ink-2">
            These records are frozen now and queued for the ML service, which runs an engine check
            and reports the result here.
          </p>
        </header>

        <div className="space-y-6 p-6">
          <div className="flex flex-wrap gap-3">
            {Object.entries(counts).map(([label, n]) => (
              <span key={label} className="inline-flex items-center gap-2">
                <OutcomeChip label={label} />
                <span className="font-mono text-[14px] tabular-nums">{n}</span>
              </span>
            ))}
          </div>

          {warnings.length ? (
            <ul className="space-y-2 border border-amber px-4 py-3 text-[13px] text-ink-2">
              {warnings.map((warning) => (
                <li key={warning}>⚠ {warning}</li>
              ))}
            </ul>
          ) : null}

          <Group legend="Batch name" required hint="So the batch is recognisable in the history.">
            <input
              className="field"
              maxLength={120}
              placeholder="October mule-ring corrections"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Group>

          <Group legend="Why this batch" hint="Optional. What makes these worth exporting now?">
            <textarea
              className="field min-h-20"
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

        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-rule p-6">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ name: name.trim(), notes: notes.trim() })}
            disabled={!name.trim() || submitting}
          >
            {submitting ? 'Queuing…' : 'Create export batch'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
