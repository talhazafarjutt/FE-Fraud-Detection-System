import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patchAlert } from '@/api/endpoints/alerts';
import type { AlertDetail } from '@/api/schemas/alerts';
import type { AlertStatus } from '@/api/schemas/common';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';
import {
  type FeedbackFormValues,
  computeModelAgreement,
  isTerminalStatus,
} from '@/api/schemas/feedback';
import { titleCase } from '@/lib/format';
import { FeedbackBlock } from './FeedbackBlock';
import { alertKeys } from './queries';
import { transitionsFor } from './stateMachine';

const EMPTY_FEEDBACK: FeedbackFormValues = {
  true_label: 'FRAUD',
  confidence: 'HIGH',
  typology: 'OTHER',
  decision_drivers: [],
  missing_signals: [],
};

const NOTE_LIMIT = 2000;

export function AlertActions({ alert }: { alert: AlertDetail }) {
  const { scopes, hasScope } = useAuth();
  const queryClient = useQueryClient();
  const { push, pushError } = useToasts();

  const [status, setStatus] = useState<AlertStatus | ''>('');
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState<string>('');
  const [feedback, setFeedback] = useState<FeedbackFormValues>(EMPTY_FEEDBACK);

  // §16.2 time_to_decide_seconds — cost per case, measured rather than asked
  // for. Feeds the threshold conversation: if a false positive takes seven
  // minutes, raising the threshold has a number attached.
  const openedAt = useRef<number>(Date.now());

  // Feedback is required on a terminal status and must never be sent on a
  // non-terminal one — the server rejects that combination.
  const needsFeedback = status !== '' && isTerminalStatus(status);

  const options = useMemo(() => transitionsFor(alert.status, scopes), [alert.status, scopes]);
  const canAssign = hasScope('alerts:assign');
  const canUpdate = hasScope('alerts:update');

  const selected = options.find((option) => option.to === status);
  const blockedReason = selected && !selected.allowed ? selected.reason : undefined;

  const mutation = useMutation({
    mutationFn: () =>
      patchAlert(alert.id, {
        ...(status ? { status } : {}),
        ...(canAssign && assignee !== '' ? { assigned_to: assignee || null } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(needsFeedback
          ? {
              feedback: {
                ...feedback,
                // Derived, never typed by the analyst.
                model_agreed:
                  computeModelAgreement(feedback.true_label, alert.fraud_probability) ?? false,
                reviewed_at: new Date().toISOString(),
                time_to_decide_seconds: Math.max(
                  0,
                  Math.round((Date.now() - openedAt.current) / 1000),
                ),
              },
            }
          : {}),
      }),
    onSuccess: (updated) => {
      push({
        tone: 'success',
        title: 'Case updated',
        detail: `Status is now ${updated.status.replace(/_/g, ' ')}.`,
      });
      setStatus('');
      setNote('');
      setAssignee('');
      setFeedback(EMPTY_FEEDBACK);
      openedAt.current = Date.now();
      // Refetch the detail so the case trail gains its entry immediately, and
      // invalidate the queue so the row reflects the new status.
      void queryClient.invalidateQueries({ queryKey: alertKeys.detail(alert.id) });
      void queryClient.invalidateQueries({ queryKey: ['alerts', 'list'] });
    },
    onError: (error) => pushError(error, 'Could not update the case'),
  });

  const nothingToSubmit = status === '' && note.trim() === '' && assignee === '';
  const submitDisabled =
    !canUpdate || nothingToSubmit || Boolean(blockedReason) || mutation.isPending;

  return (
    <div className="border border-rule bg-surface">
      <div className="border-b border-rule px-6 py-4">
        <p className="eyebrow !mb-0">Actions</p>
      </div>

      <div className="space-y-5 p-6">
        <div>
          <label htmlFor="status" className="mono-label mb-2 block text-ink-3">
            Move to
          </label>
          <select
            id="status"
            className="field"
            value={status}
            disabled={!canUpdate || options.length === 0}
            onChange={(event) => setStatus(event.target.value as AlertStatus | '')}
          >
            <option value="">Leave unchanged</option>
            {/* Only legal transitions appear. Ones the caller's scopes do not
                permit are listed but marked, so the capability is visible and
                the gate is explained rather than silently hidden. */}
            {options.map((option) => (
              <option key={option.to} value={option.to}>
                {titleCase(option.to)}
                {option.allowed ? '' : ' — not permitted'}
              </option>
            ))}
          </select>
          {blockedReason ? (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-tag text-amber">
              {blockedReason}
            </p>
          ) : null}
          {!canUpdate ? (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-tag text-amber">
              This account cannot update cases.
            </p>
          ) : null}
        </div>

        {canAssign ? (
          <div>
            <label htmlFor="assignee" className="mono-label mb-2 block text-ink-3">
              Assign to
            </label>
            <input
              id="assignee"
              className="field"
              placeholder="ANALYST USER ID, OR BLANK TO UNASSIGN"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
            />
          </div>
        ) : (
          <p className="border border-rule-soft px-4 py-3 font-mono text-[11px] uppercase tracking-tag text-ink-3">
            Assigning a case requires a supervisor.
          </p>
        )}

        <div>
          <label htmlFor="note" className="mono-label mb-2 flex justify-between text-ink-3">
            <span>Note</span>
            <span className="num tabular-nums">
              {note.length}/{NOTE_LIMIT}
            </span>
          </label>
          <textarea
            id="note"
            rows={4}
            maxLength={NOTE_LIMIT}
            className="field font-body text-[15px] tracking-normal"
            placeholder="What you found, and what you did about it."
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        {needsFeedback ? (
          <FeedbackBlock
            value={feedback}
            onChange={setFeedback}
            explanation={alert.explanation}
            fraudProbability={alert.fraud_probability}
            disabled={mutation.isPending}
          />
        ) : null}

        <Button
          onClick={() => mutation.mutate()}
          disabled={submitDisabled}
          className="w-full"
          title={blockedReason}
        >
          {mutation.isPending ? 'Recording' : needsFeedback ? 'Close case with feedback' : 'Record action'}
        </Button>
      </div>
    </div>
  );
}
