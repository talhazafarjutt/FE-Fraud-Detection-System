import type { CaseFeedback } from '@/api/schemas/cases';
import { Eyebrow, Panel, Tag, cx } from '@/components/primitives';
import { formatAbsolute, shortId } from '@/lib/format';
import { bandForScore, BAND_HEX } from '@/lib/risk';

/**
 * The recorded verdict.
 *
 * `original_*` are the scores AS THEY WERE AT THE MOMENT OF DECISION, not
 * current values. That distinction is the whole point of storing them: a
 * re-score six months later must not quietly rewrite what the reviewer
 * actually saw, or the record stops being evidence.
 */
const AGREEMENT_COPY: Record<string, string> = {
  AGREES: 'The reviewer and the engine reached the same conclusion.',
  PARTIAL: 'Right answer, partly wrong reasoning.',
  DISAGREES: 'The engine was wrong, or right by accident.',
};

const LABEL_TONE: Record<string, string> = {
  CONFIRMED_FRAUD: 'border-carmine bg-carmine text-on-carmine',
  FALSE_POSITIVE: 'border-sage text-sage',
  INCONCLUSIVE: 'border-ink-3 text-ink-3',
};

export function VerdictPanel({ feedback }: { feedback: CaseFeedback }) {
  const label = String(feedback.final_label);
  const alertCount = feedback.alert_count ?? 1;

  const signals: Array<[string, number | null | undefined]> = [
    ['Model', feedback.original_model_score],
    ['Rule', feedback.original_rule_score],
    ['Anomaly', feedback.original_anomaly_score],
    ['Network', feedback.original_network_score],
  ];

  return (
    <Panel className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Verdict</Eyebrow>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cx(
                'inline-flex items-center border px-3 py-1.5 font-mono text-[12px] uppercase tracking-tag',
                LABEL_TONE[label] ?? 'border-rule text-ink-2',
              )}
            >
              {label.replace(/_/g, ' ')}
            </span>
            <Tag>{String(feedback.confidence)} confidence</Tag>
            <Tag title={AGREEMENT_COPY[String(feedback.model_agreement)]}>
              Model {String(feedback.model_agreement).toLowerCase()}
            </Tag>
            {feedback.fraud_typology ? <Tag>{feedback.fraud_typology}</Tag> : null}
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[12px] text-ink-2">{formatAbsolute(feedback.decided_at)}</p>
          <p className="font-mono text-[11px] text-ink-3">
            by {shortId(feedback.reviewer_user_id)}
          </p>
        </div>
      </div>

      <p className="mb-6 max-w-2xl text-ink-2">
        One judgement covering{' '}
        <strong>
          {alertCount} alert{alertCount === 1 ? '' : 's'}
        </strong>
        . {AGREEMENT_COPY[String(feedback.model_agreement)] ?? ''}
      </p>

      <div className="mb-6 border border-rule">
        <div className="border-b border-rule bg-paper px-4 py-3">
          <Eyebrow className="!mb-0">Scores at the moment of decision</Eyebrow>
        </div>
        <div className="grid gap-px bg-rule sm:grid-cols-5">
          <div className="bg-surface p-4">
            <p className="mono-label text-ink-3">Risk</p>
            <p
              className="font-mono text-[26px] tabular-nums"
              style={
                feedback.original_risk_score != null
                  ? { color: BAND_HEX[bandForScore(feedback.original_risk_score)] }
                  : undefined
              }
            >
              {feedback.original_risk_score != null
                ? Math.round(feedback.original_risk_score)
                : '—'}
            </p>
          </div>
          {signals.map(([name, value]) => (
            <div key={name} className="bg-surface p-4">
              <p className="mono-label text-ink-3">{name}</p>
              <p className="font-mono text-[18px] tabular-nums text-ink-2">
                {value != null ? Math.round(value) : '—'}
              </p>
            </div>
          ))}
        </div>
        <div className="border-t border-rule bg-paper px-4 py-2 font-mono text-[11px] text-ink-3">
          {feedback.model_version ? `model ${feedback.model_version}` : 'model —'}
          {feedback.risk_engine_version ? ` · engine ${feedback.risk_engine_version}` : ''}
          {feedback.score_id ? ` · score ${shortId(feedback.score_id)}` : ''}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ListBlock
          title="What drove the decision"
          items={feedback.decision_drivers ?? []}
          empty="Not recorded."
        />
        <ListBlock
          title="What was missing"
          items={feedback.missing_signals ?? []}
          empty="Nothing flagged as missing."
        />
      </div>

      {feedback.original_triggered_rules?.length ? (
        <div className="mt-6">
          <Eyebrow>Rules that had fired</Eyebrow>
          <ul className="space-y-2">
            {feedback.original_triggered_rules.map((rule, index) => (
              <li key={`${rule.rule}-${index}`} className="flex flex-wrap items-baseline gap-3">
                <Tag>{rule.rule}</Tag>
                {rule.severity ? (
                  <span className="mono-label text-ink-3">{rule.severity}</span>
                ) : null}
                {rule.description ? (
                  <span className="text-ink-2">{rule.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {feedback.notes ? (
        <div className="mt-6">
          <Eyebrow>Reviewer notes</Eyebrow>
          <p className="max-w-3xl whitespace-pre-wrap text-ink-2">{feedback.notes}</p>
        </div>
      ) : null}
    </Panel>
  );
}

function ListBlock({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      <Eyebrow>{title}</Eyebrow>
      {items.length === 0 ? (
        <p className="text-ink-3">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item}>
              <Tag>{item}</Tag>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
