import { Suspense, lazy } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAlert } from '@/api/endpoints/alerts';
import { getTransaction } from '@/api/endpoints/transactions';
import { SeverityChip, StatusChip } from '@/components/Chips';
import { Button, Eyebrow, SectionHeading, Skeleton } from '@/components/primitives';
import { formatAbsolute, formatRelative, shortId, titleCase } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { errorStatus } from '@/lib/problem';
import { AlertActions } from './AlertActions';
import { CaseTrail } from './CaseTrail';
import { ProbabilityDial } from './ProbabilityDial';
import { alertKeys } from './queries';

// Recharts is pulled in only when a case is opened.
const ExplanationChart = lazy(() => import('./ExplanationChart'));

export default function AlertDetailPage() {
  const { alertId = '' } = useParams();

  const {
    data: alert,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: alertKeys.detail(alertId),
    queryFn: ({ signal }) => getAlert(alertId, signal),
    enabled: alertId !== '',
  });

  // The alert detail response returns amount/currency as null (verified against
  // the running backend); the figures come from the linked transaction instead.
  const transaction = useQuery({
    queryKey: ['transactions', 'detail', alert?.transaction_id],
    queryFn: ({ signal }) => getTransaction(alert!.transaction_id, signal),
    enabled: Boolean(alert?.transaction_id),
  });

  if (isPending) return <DetailSkeleton />;

  if (isError) {
    const status = errorStatus(error);
    return (
      <div className="border border-rule bg-surface p-8">
        <Eyebrow>Case unavailable</Eyebrow>
        <h2 className="mb-3">
          {status === 404 ? 'Not found, or outside your team.' : 'This case could not be loaded.'}
        </h2>
        <p className="mb-6 max-w-xl text-ink-2">
          {/*
            The backend returns 404 — not 403 — for an alert belonging to another
            team. We must not say "you don't have permission", because that would
            leak the existence of a case the caller is not entitled to know about.
          */}
          {status === 404
            ? 'No case with this identifier is visible to your account. It may not exist, or it may belong to another team.'
            : 'The platform did not return this case. It may be restarting.'}
        </p>
        <div className="flex gap-3">
          <Link to="/alerts" className="btn btn--ghost">
            Back to queue
          </Link>
          {status !== 404 ? <Button onClick={() => void refetch()}>Retry</Button> : null}
        </div>
      </div>
    );
  }

  const positive = alert.explanation.filter((r) => r.contribution > 0).length;
  const negative = alert.explanation.length - positive;

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-rule pb-6">
        <div>
          <Eyebrow className="!mb-2">Case {shortId(alert.id)}</Eyebrow>
          <h1 className="mb-4">Case file</h1>
          <div className="flex flex-wrap items-center gap-3">
            <SeverityChip severity={alert.severity} />
            <StatusChip status={alert.status} />
            <span className="tag">Team {alert.team}</span>
            <span className="tag" title={formatAbsolute(alert.opened_at)}>
              Opened {formatRelative(alert.opened_at)}
            </span>
          </div>
        </div>
        <Link to="/alerts" className="btn btn--ghost">
          Back to queue
        </Link>
      </header>

      <section className="space-y-6">
        <SectionHeading
          index="01"
          title="Verdict"
          hint="What the model scored, and what the platform did about it."
        />

        <div className="grid gap-px border border-rule bg-rule lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="flex items-center justify-center bg-surface p-8">
            <ProbabilityDial probability={alert.fraud_probability} />
          </div>

          <div className="grid gap-px bg-rule sm:grid-cols-2">
            <Fact label="Model" value={alert.model_name ?? '—'} />
            <Fact label="Version" value={alert.model_version ?? '—'} mono />
            {/*
              The model's decision is a suggestion. The alert is what the
              platform actually did. Labelling them separately is the point:
              it shows the system does not blindly obey the model.
            */}
            <Fact
              label="Model suggestion"
              value={alert.model_decision ? titleCase(alert.model_decision) : '—'}
            />
            <Fact label="Platform action" value="Alert raised for review" />
            <Fact
              label="Amount"
              value={
                transaction.data
                  ? formatMoney(transaction.data.amount, transaction.data.currency)
                  : transaction.isPending
                    ? '…'
                    : '—'
              }
              mono
            />
            <Fact
              label="Assignee"
              value={alert.assigned_to ? shortId(alert.assigned_to) : 'Unassigned'}
              mono
            />
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <SectionHeading
          index="02"
          title="Why"
          hint={
            alert.explanation.length === 0
              ? 'The model returned no feature contributions for this decision.'
              : `${positive} feature${positive === 1 ? '' : 's'} pushed this score up${
                  negative ? `, ${negative} pulled it down` : ''
                }. Bars to the right raised the risk; bars to the left lowered it.`
          }
        />

        {alert.explanation.length === 0 ? (
          <p className="border border-rule-soft px-4 py-6 text-ink-2">
            No explanation was recorded with this score.
          </p>
        ) : (
          <div className="border border-rule bg-surface p-6">
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <ExplanationChart reasons={alert.explanation} />
            </Suspense>
          </div>
        )}
      </section>

      <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <SectionHeading
            index="03"
            title="Case trail"
            hint="Every state change, with the actor who made it and when."
          />
          <CaseTrail events={alert.events} />
        </div>

        <div className="space-y-6">
          <AlertActions alert={alert} />
          <TransactionSummary
            transactionId={alert.transaction_id}
            data={transaction.data}
            isPending={transaction.isPending}
            isError={transaction.isError}
          />
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-surface p-5">
      <p className="mono-label mb-2 text-ink-3">{label}</p>
      <p className={mono ? 'font-mono text-[13px] text-ink' : 'text-[15px] text-ink'}>{value}</p>
    </div>
  );
}

function TransactionSummary({
  transactionId,
  data,
  isPending,
  isError,
}: {
  transactionId: string;
  data: import('@/api/schemas/transactions').Transaction | undefined;
  isPending: boolean;
  isError: boolean;
}) {
  return (
    <div className="border border-rule bg-surface">
      <div className="border-b border-rule px-6 py-4">
        <p className="eyebrow !mb-0">Linked transaction</p>
      </div>
      <div className="p-6">
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ) : isError || !data ? (
          <p className="text-ink-2">This transaction is not readable by your account.</p>
        ) : (
          <dl className="space-y-4">
            <Row label="Reference" value={data.external_ref ?? shortId(transactionId)} />
            <Row label="Type" value={titleCase(data.transaction_type)} />
            <Row label="Booked" value={formatAbsolute(data.booked_at)} />
            <Row label="Amount" value={formatMoney(data.amount, data.currency)} />
            <Row label="Sender balance before" value={formatMoney(data.sender_balance_before, data.currency)} />
            <Row
              label="Receiver balance before"
              value={formatMoney(data.receiver_balance_before, data.currency)}
            />
            <Row label="Source account" value={`•••• ${data.src_account_last4}`} />
            <Row label="Destination account" value={`•••• ${data.dst_account_last4}`} />
            <p className="border-t border-rule-soft pt-4 text-[13px] leading-relaxed text-ink-3">
              Account numbers are masked to the last four digits by the platform. Full IBANs are
              never returned to this console.
            </p>
          </dl>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="mono-label text-ink-3">{label}</dt>
      <dd className="num text-right font-mono text-[12px] tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-3 border-b border-rule pb-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-72" />
      </div>
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
