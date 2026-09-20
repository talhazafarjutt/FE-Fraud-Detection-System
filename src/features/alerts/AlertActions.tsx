import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patchAlert } from '@/api/endpoints/alerts';
import type { AlertDetail } from '@/api/schemas/alerts';
import type { AlertStatus } from '@/api/schemas/common';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';
import { isTerminalStatus } from '@/api/schemas/feedback';
import { Link } from 'react-router-dom';
import { titleCase } from '@/lib/format';
import { alertKeys } from './queries';
import { transitionsFor } from './stateMachine';

const NOTE_LIMIT = 2000;

export function AlertActions({ alert }: { alert: AlertDetail }) {
  const { scopes, hasScope } = useAuth();
  const queryClient = useQueryClient();
  const { push, pushError } = useToasts();

  const [status, setStatus] = useState<AlertStatus | ''>('');
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState<string>('');
  /**
   * A terminal status is a VERDICT, and a verdict belongs to the case, not to
   * one alert inside it.
   *
   * This endpoint rejects a feedback block with 422 — deliberately. One scheme
   * gets one judgement: concluding nine alerts separately would emit nine
   * correlated training labels for a single fraud event and skew the next
   * model. `PATCH /v1/cases/{id}` is where the verdict goes, behind the
   * required feedback form.
   *
   * So the move is blocked here and the user is sent to the case instead.
   */
  const needsVerdict = status !== '' && isTerminalStatus(status);

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
      // Refetch the detail so the case trail gains its entry immediately, and
      // invalidate the queue so the row reflects the new status.
      void queryClient.invalidateQueries({ queryKey: alertKeys.detail(alert.id) });
      void queryClient.invalidateQueries({ queryKey: ['alerts', 'list'] });
    },
    onError: (error) => pushError(error, 'Could not update the case'),
  });

  const nothingToSubmit = status === '' && note.trim() === '' && assignee === '';
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

        {needsVerdict ? (
          <div className="border border-amber bg-paper p-4">
            <p className="mono-label mb-2 text-amber">A verdict belongs to the case</p>
            <p className="mb-3 text-[13px] text-ink-2">
              {titleCase(status)} is a judgement about the whole scheme, not about this one
              alert. It is recorded once, on the investigation, with the label, confidence and
              model agreement that make it usable as training data.
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
          onClick={() => mutation.mutate()}
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
