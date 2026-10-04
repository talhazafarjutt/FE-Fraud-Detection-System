import { type ReactNode, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attachAlert, detachAlert, getCase, patchCase } from '@/api/endpoints/cases';
import { listCaseAudit } from '@/api/endpoints/audit';
import type { CaseDetail, FeedbackInput, FinalLabel } from '@/api/schemas/cases';
import { ApiErrorPanel, EmptyPanel, LoadingRows } from '@/components/ApiStates';
import { SeverityChip, StatusChip } from '@/components/Chips';
import { Button, Eyebrow, Panel, SectionHeading, cx } from '@/components/primitives';
import { useAuth } from '@/auth/AuthProvider';
import { useToasts } from '@/components/Toasts';
import { formatAbsolute, formatRelative, shortId } from '@/lib/format';
import { describeFailure } from '@/lib/problem';
import { transitionsFor } from '@/features/alerts/stateMachine';
import { AuditTable } from '@/features/audit/AuditLogPage';
import { AssigneePicker } from '@/features/users/AssigneePicker';
import { UserName } from '@/features/users/UserName';
import { ConcludeModal } from './ConcludeModal';
import { FindingsPanel } from './FindingsPanel';
import { VerdictPanel } from './VerdictPanel';
import { CaseCurationPanel } from '@/features/labelled-feedback/CaseCurationPanel';

const VERDICT_LABELS: readonly FinalLabel[] = ['CONFIRMED_FRAUD', 'FALSE_POSITIVE', 'INCONCLUSIVE'];

/**
 * One investigation.
 *
 * The state machine is enforced on both sides. OPEN → CONFIRMED_FRAUD is
 * rejected by the server — an investigation has to be picked up before it can
 * be confirmed as fraud — so that option is greyed out on an OPEN case while
 * FALSE_POSITIVE, which IS legal from OPEN, stays available.
 *
 * Concluding requires `alerts:close`, which an analyst does not have — that is
 * four-eyes, not an oversight. The control is therefore shown and disabled WITH
 * THE REASON rather than hidden: silently missing buttons read as a bug, and an
 * analyst needs to understand that the step exists and belongs to someone else.
 */
export default function CaseDetailPage() {
  const { caseId = '' } = useParams();
  const { scopes, hasScope } = useAuth();
  const toast = useToasts();
  const queryClient = useQueryClient();
  const [concluding, setConcluding] = useState(false);
  const [attachId, setAttachId] = useState('');
  /** undefined = untouched; the picker shows the case's current assignee. */
  const [assignee, setAssignee] = useState<string | null | undefined>(undefined);

  const detail = useQuery({
    queryKey: ['cases', 'detail', caseId],
    queryFn: ({ signal }) => getCase(caseId, signal),
    enabled: caseId !== '',
  });

  const trail = useQuery({
    queryKey: ['cases', 'audit', caseId],
    queryFn: ({ signal }) => listCaseAudit(caseId, signal),
    // The trail describes the analysts; only a supervisor or admin may read it.
    enabled: caseId !== '' && hasScope('audit:read'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['cases'] });
    void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    // Concluding again resets the record's curation status.
    void queryClient.invalidateQueries({ queryKey: ['labelled-feedback'] });
  };

  // No `note` here: on a case it is only accepted with a status change, and
  // nothing on this page sends one. Investigation text goes in findings.
  const patch = useMutation({
    mutationFn: (input: { status?: string; feedback?: FeedbackInput }) =>
      patchCase(caseId, input),
    onSuccess: (updated: CaseDetail) => {
      setConcluding(false);
      invalidate();
      toast.push({
        tone: 'success',
        title: `Case is now ${String(updated.status).replace(/_/g, ' ')}.`,
        ...(updated.feedback
          ? {
              detail: `Recorded as one labelled verdict covering ${updated.alert_count ?? 1} alert${
                (updated.alert_count ?? 1) === 1 ? '' : 's'
              }.`,
            }
          : {}),
      });
    },
    onError: (error) => toast.pushError(error, 'Could not update the case'),
  });

  const saveFindings = useMutation({
    mutationFn: (findings: string) => patchCase(caseId, { findings }),
    onSuccess: (updated) => {
      invalidate();
      toast.push({ tone: 'success', title: updated.findings ? 'Findings saved.' : 'Findings cleared.' });
    },
  });

  const assign = useMutation({
    mutationFn: (to: string | null) => patchCase(caseId, { assigned_to: to }),
    onSuccess: (updated) => {
      // Cache first, or the picker flashes the old assignee until the refetch.
      queryClient.setQueryData(['cases', 'detail', caseId], updated);
      setAssignee(undefined);
      invalidate();
      toast.push({
        tone: 'success',
        title: updated.assigned_to ? 'Case assigned.' : 'Case unassigned.',
        detail: 'Open member alerts follow the case.',
      });
    },
  });

  const attach = useMutation({
    mutationFn: (alertId: string) => attachAlert(caseId, alertId),
    onSuccess: () => {
      setAttachId('');
      invalidate();
      toast.push({ tone: 'success', title: 'Alert attached to this investigation.' });
    },
    onError: (error) => toast.pushError(error, 'Could not attach that alert'),
  });

  const detach = useMutation({
    mutationFn: (alertId: string) => detachAlert(caseId, alertId),
    onSuccess: () => {
      invalidate();
      toast.push({ tone: 'info', title: 'Alert detached.' });
    },
    onError: (error) => toast.pushError(error, 'Could not detach that alert'),
  });

  const transitions = useMemo(
    () => (detail.data ? transitionsFor(String(detail.data.status), scopes) : []),
    [detail.data, scopes],
  );

  if (detail.isError) {
    return (
      <div className="space-y-6">
        <BackLink />
        <ApiErrorPanel
          error={detail.error}
          what="this investigation"
          scopeHint="alerts:read"
          onRetry={() => void detail.refetch()}
        />
      </div>
    );
  }

  if (detail.isPending) {
    return (
      <div className="space-y-6">
        <BackLink />
        <LoadingRows label="Loading investigation" />
      </div>
    );
  }

  const investigation = detail.data;
  const alerts = investigation.alerts ?? [];
  const alertCount = investigation.alert_count ?? alerts.length;
  const canClose = hasScope('alerts:close');
  const currentAssignee = investigation.assigned_to ?? null;
  const pickedAssignee = assignee === undefined ? currentAssignee : assignee;

  // Only the verdicts the server would actually accept from here.
  const allowedVerdicts = VERDICT_LABELS.filter((label) =>
    transitions.some((t) => t.to === label && t.allowed),
  );
  const verdictBlocked = transitions.find(
    (t) => VERDICT_LABELS.includes(t.to as FinalLabel) && !t.allowed,
  );

  const triage = transitions.filter((t) => !VERDICT_LABELS.includes(t.to as FinalLabel));
  const patchError = patch.error ? describeFailure(patch.error).detail : undefined;

  return (
    <div className="space-y-8">
      <BackLink />

      <SectionHeading
        index="07"
        title={investigation.title}
        hint={`${alertCount} alert${alertCount === 1 ? '' : 's'} grouped into one investigation. One scheme, one judgement — a verdict per alert would emit ${alertCount} correlated labels for a single event.`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <StatusChip status={String(investigation.status)} />
            <SeverityChip severity={String(investigation.severity)} />
          </div>
        }
      />

      <div className="grid gap-px border border-rule bg-rule md:grid-cols-5">
        <Fact label="Alerts in scheme" value={String(alertCount)} />
        <Fact label="Team" value={investigation.team} />
        <Fact
          label="Assigned to"
          value={<UserName id={investigation.assigned_to} empty="Unassigned" />}
        />
        <Fact
          label="Opened"
          value={formatRelative(investigation.opened_at)}
          hint={formatAbsolute(investigation.opened_at)}
        />
        <Fact
          label="Closed"
          value={investigation.closed_at ? formatRelative(investigation.closed_at) : 'Still open'}
          hint={investigation.closed_at ? formatAbsolute(investigation.closed_at) : undefined}
        />
      </div>

      <FindingsPanel
        findings={investigation.findings}
        findingsBy={investigation.findings_by}
        findingsAt={investigation.findings_at}
        status={String(investigation.status)}
        canEdit={hasScope('alerts:update')}
        saving={saveFindings.isPending}
        {...(saveFindings.error ? { error: describeFailure(saveFindings.error).detail } : {})}
        onSave={(findings) => saveFindings.mutate(findings)}
      />

      {/* --- Actions --------------------------------------------------- */}
      <Panel className="p-6">
        <Eyebrow>Move this investigation</Eyebrow>
        <p className="mb-5 max-w-2xl text-ink-2">
          The status machine is enforced by the server as well as here, and only legal moves are
          offered. Confirming fraud is never one of them straight from OPEN — an investigation has
          to be picked up first — while dismissing something as a false positive is.
        </p>

        <div className="flex flex-wrap gap-3">
          {triage.length === 0 ? (
            <p className="text-ink-3">No moves available from this status.</p>
          ) : (
            triage.map((option) => (
              <Button
                key={option.to}
                variant="ghost"
                disabled={!option.allowed || patch.isPending}
                title={option.reason}
                onClick={() => patch.mutate({ status: option.to })}
              >
                {option.to.replace(/_/g, ' ')}
              </Button>
            ))
          )}

          {allowedVerdicts.length > 0 ? (
            <Button disabled={patch.isPending} onClick={() => setConcluding(true)}>
              Conclude investigation…
            </Button>
          ) : verdictBlocked ? (
            /*
             * Disabled, present, and carrying its reason. An analyst who cannot
             * find the control at all concludes the feature is broken; one who
             * sees it greyed out with "Concluding requires a supervisor"
             * understands the separation of duties.
             */
            <span
              className="inline-flex items-center border border-rule px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-3"
              title={verdictBlocked.reason}
            >
              Conclude — {verdictBlocked.reason ?? 'not available'}
            </span>
          ) : null}
        </div>

        {!canClose ? (
          <p className="mt-4 max-w-2xl text-[12px] text-ink-3">
            You hold <code>alerts:update</code> but not <code>alerts:close</code>. Whoever
            investigates a case is deliberately not the person who signs it off.
          </p>
        ) : null}

        {hasScope('alerts:assign') ? (
          <form
            className="mt-6 border-t border-rule pt-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (pickedAssignee !== currentAssignee) assign.mutate(pickedAssignee);
            }}
          >
            <label htmlFor="case-assignee" className="eyebrow !mb-2 block">
              Assign
            </label>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-64 grow sm:max-w-md">
                <AssigneePicker
                  id="case-assignee"
                  team={investigation.team}
                  value={pickedAssignee}
                  onChange={(next) => {
                    assign.reset();
                    setAssignee(next);
                  }}
                  disabled={assign.isPending}
                  {...(assign.error ? { error: describeFailure(assign.error).detail } : {})}
                />
              </div>
              <Button
                type="submit"
                variant="ghost"
                disabled={pickedAssignee === currentAssignee || assign.isPending}
              >
                {assign.isPending ? 'Saving…' : 'Save assignment'}
              </Button>
            </div>
            <p className="mt-2 text-[12px] text-ink-3">
              Open member alerts are reassigned with the case.
            </p>
          </form>
        ) : null}
      </Panel>

      {/* --- Verdict --------------------------------------------------- */}
      {investigation.feedback ? <VerdictPanel feedback={investigation.feedback} /> : null}

      {/* Supervisor only: whether this verdict is validated for export. */}
      {investigation.feedback && hasScope('feedback:review') ? (
        <CaseCurationPanel feedbackId={investigation.feedback.id} />
      ) : null}

      {/* --- Member alerts --------------------------------------------- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Member alerts</Eyebrow>
            <p className="max-w-2xl text-ink-2">
              Every alert the engine grouped into this scheme. If the grouping got it wrong, attach
              or detach here — the verdict then covers exactly the alerts listed.
            </p>
          </div>
        </div>

        {alerts.length === 0 ? (
          <EmptyPanel
            title="No member alerts returned"
            body="The case exists but its alert list came back empty."
          />
        ) : (
          <div className="overflow-x-auto border border-rule bg-surface">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-rule">
                  {['Alert', 'Transaction', 'Status', 'Severity', 'Opened', ''].map((label, i) => (
                    <th
                      key={label || i}
                      className="px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id} className="border-b border-rule-soft last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        to={`/alerts/${alert.id}`}
                        className="font-mono text-[12px] hover:text-ultra"
                      >
                        {shortId(alert.id)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-ink-2">
                      {shortId(alert.transaction_id)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={String(alert.status)} />
                    </td>
                    <td className="px-4 py-3">
                      <SeverityChip severity={String(alert.severity)} />
                    </td>
                    <td className="px-4 py-3 text-ink-2" title={formatAbsolute(alert.opened_at)}>
                      {formatRelative(alert.opened_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="font-mono text-[11px] uppercase tracking-label text-ink-3 hover:text-carmine disabled:opacity-40"
                        disabled={!hasScope('alerts:update') || detach.isPending}
                        title={
                          hasScope('alerts:update')
                            ? 'Remove this alert from the investigation'
                            : 'Editing membership requires alerts:update'
                        }
                        onClick={() => detach.mutate(alert.id)}
                      >
                        Detach
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form
          className="flex flex-wrap items-end gap-3 border border-rule bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (attachId.trim()) attach.mutate(attachId.trim());
          }}
        >
          <label className="grow">
            <Eyebrow className="!mb-2">Attach an alert the grouping missed</Eyebrow>
            <input
              className="field"
              placeholder="Alert id"
              value={attachId}
              onChange={(event) => setAttachId(event.target.value)}
            />
          </label>
          <Button
            type="submit"
            variant="ghost"
            disabled={!attachId.trim() || attach.isPending || !hasScope('alerts:update')}
            title={hasScope('alerts:update') ? undefined : 'Requires alerts:update'}
          >
            {attach.isPending ? 'Attaching…' : 'Attach'}
          </Button>
        </form>
      </section>

      {/* --- Trail ------------------------------------------------------ */}
      {hasScope('audit:read') ? (
        <section className="space-y-4">
          <div>
            <Eyebrow>Case history</Eyebrow>
            <p className="max-w-2xl text-ink-2">
              Every action recorded against this investigation, newest first. Append-only.
            </p>
          </div>
          {trail.isError ? (
            <ApiErrorPanel error={trail.error} what="this case's history" scopeHint="audit:read" />
          ) : trail.isPending ? (
            <LoadingRows rows={3} label="Loading history" />
          ) : trail.data.items.length === 0 ? (
            <EmptyPanel title="Nothing recorded against this case yet" />
          ) : (
            <AuditTable rows={trail.data.items} compact />
          )}
        </section>
      ) : null}

      {/* Feedback is only ever sent by an alerts:close holder; the API 403s anyone else. */}
      <ConcludeModal
        open={concluding && canClose}
        onClose={() => setConcluding(false)}
        submitting={patch.isPending}
        alertCount={alertCount}
        caseTitle={investigation.title}
        allowedLabels={allowedVerdicts}
        findings={investigation.findings}
        findingsBy={investigation.findings_by}
        {...(patchError ? { error: patchError } : {})}
        onSubmit={(status, feedback) => patch.mutate({ status, feedback })}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/cases"
      className="font-mono text-[11px] uppercase tracking-label text-ink-3 hover:text-ultra"
    >
      ← All cases
    </Link>
  );
}

function Fact({ label, value, hint }: { label: string; value: ReactNode; hint?: string | undefined }) {
  return (
    <div className="bg-surface p-4">
      <Eyebrow className="!mb-2">{label}</Eyebrow>
      <p className={cx('text-ink', label === 'Alerts in scheme' && 'font-mono text-[22px]')}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

