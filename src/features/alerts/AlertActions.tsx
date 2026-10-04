import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patchAlert } from '@/api/endpoints/alerts';
import type { AlertDetail, AlertPatch } from '@/api/schemas/alerts';
import type { AlertStatus } from '@/api/schemas/common';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';
import { isTerminalStatus } from '@/api/schemas/feedback';
import { Link } from 'react-router-dom';
import { titleCase } from '@/lib/format';
import { describeFailure } from '@/lib/problem';
import { AssigneePicker } from '@/features/users/AssigneePicker';
import { alertKeys } from './queries';
import { transitionsFor } from './stateMachine';

const NOTE_LIMIT = 2000;

export function AlertActions({ alert }: { alert: AlertDetail }) {
  const { scopes, hasScope } = useAuth();
  const queryClient = useQueryClient();
  const { push, pushError } = useToasts();

  const [status, setStatus] = useState<AlertStatus | ''>('');
  const [note, setNote] = useState('');
  /** undefined = untouched; the picker shows the current assignee. */
  const [assignee, setAssignee] = useState<string | null | undefined>(undefined);
  /**
   * A terminal status is a VERDICT, and a verdict belongs to the case, not to
   * one alert inside it.
   *
   * This endpoint rejects a feedback block with 422 — deliberately. One scheme
   * gets one judgement: concluding nine alerts separately would emit nine
   * correlated labels for a single fraud event. `PATCH /v1/cases/{id}` is
   * where the verdict goes, behind the required feedback form.
   *
   * So the move is blocked here and the user is sent to the case instead.
   */
  const needsVerdict = status !== '' && isTerminalStatus(status);

  const options = useMemo(() => transitionsFor(alert.status, scopes), [alert.status, scopes]);
  const canAssign = hasScope('alerts:assign');
  const canUpdate = hasScope('alerts:update');

  const currentAssignee = alert.assigned_to ?? null;
  const pickedAssignee = assignee === undefined ? currentAssignee : assignee;
  const assigneeChanged = canAssign && pickedAssignee !== currentAssignee;

  const selected = options.find((option) => option.to === status);
  const blockedReason = selected && !selected.allowed ? selected.reason : undefined;

  const mutation = useMutation({
    mutationFn: (patch: AlertPatch) => patchAlert(alert.id, patch),
    onSuccess: (updated, sent) => {
      // A note on its own is recorded as a trail entry; the status did not move.
      push(
        sent.status
          ? {
              tone: 'success',
              title: 'Case updated',
              detail: `Status is now ${updated.status.replace(/_/g, ' ')}.${
                sent.note ? ' Note added to the case trail.' : ''
              }`,
            }
          : sent.note
            ? { tone: 'success', title: 'Note recorded', detail: 'Added to the case trail.' }
            : { tone: 'success', title: 'Case updated', detail: 'Assignment saved.' },
      );
      // Write the answer into the cache first, or the picker shows the old
      // assignee until the refetch lands. Only the fields the PATCH changed:
      // the response is the summary shape, not the detail.
      queryClient.setQueryData<AlertDetail>(alertKeys.detail(alert.id), (current) =>
        current && { ...current, status: updated.status, assigned_to: updated.assigned_to },
      );
      setStatus('');
      setNote('');
      setAssignee(undefined);
      // Refetch the detail so the case trail gains its entry immediately, and
      // invalidate the queue so the row reflects the new status.
      void queryClient.invalidateQueries({ queryKey: alertKeys.detail(alert.id) });
      void queryClient.invalidateQueries({ queryKey: ['alerts', 'list'] });
    },
    onError: (error) => {
      // A rejected assignee is shown under the picker instead.
      if (describeFailure(error).fieldErrors?.some((e) => e.field === 'assigned_to')) return;
      pushError(error, 'Could not update the case');
    },
  });

  const nothingToSubmit = status === '' && note.trim() === '' && !assigneeChanged;
  const failure = mutation.error ? describeFailure(mutation.error) : null;
  const assigneeError = failure?.fieldErrors?.some((e) => e.field === 'assigned_to')
    ? failure.detail
    : undefined;
  const submitDisabled =
    !canUpdate ||
    nothingToSubmit ||
    Boolean(blockedReason) ||
    // Triage moves work here; a verdict does not, and would 422. Blocked
    // rather than allowed to fail in a way the user cannot act on.
    needsVerdict ||
    mutation.isPending;

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
            <AssigneePicker
              id="assignee"
              team={alert.team}
              value={pickedAssignee}
              onChange={(next) => {
                mutation.reset();
                setAssignee(next);
              }}
              disabled={mutation.isPending}
              error={assigneeError}
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

        {needsVerdict ? (
          <div className="border border-amber bg-paper p-4">
            <p className="mono-label mb-2 text-amber">A verdict belongs to the case</p>
            <p className="mb-3 text-[13px] text-ink-2">
              {titleCase(status)} is a judgement about the whole scheme, not about this one
              alert. It is recorded once, on the investigation, with the label, confidence and
              model agreement that make it usable as labelled feedback.
            </p>
            {alert.case_id ? (
              <Link to={`/cases/${alert.case_id}`} className="btn btn--ghost">
                Conclude on the investigation
              </Link>
            ) : (
              <p className="text-[13px] text-ink-3">
                This alert is not attached to an investigation yet. Attach it to one from the
                case page, then conclude there.
              </p>
            )}
          </div>
        ) : null}

        <Button
          onClick={() =>
            mutation.mutate({
              ...(status ? { status } : {}),
              ...(assigneeChanged ? { assigned_to: pickedAssignee } : {}),
              ...(note.trim() ? { note: note.trim() } : {}),
            })
          }
          disabled={submitDisabled}
          className="w-full"
          title={needsVerdict ? 'A verdict is recorded on the investigation.' : blockedReason}
        >
          {mutation.isPending ? 'Recording' : 'Record action'}
        </Button>
      </div>
    </div>
  );
}
