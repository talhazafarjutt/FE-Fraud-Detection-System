import { useEffect, useMemo, useState } from 'react';
import type { Reason } from '@/api/schemas/common';
import {
  CONFIDENCE_LEVELS,
  type FeedbackFormValues,
  TRUE_LABELS,
  TYPOLOGIES,
  computeModelAgreement,
} from '@/api/schemas/feedback';
import { cx } from '@/components/primitives';
import { RISK_THRESHOLDS, formatProbability } from '@/lib/risk';

const LABEL_COPY: Record<(typeof TRUE_LABELS)[number], string> = {
  FRAUD: 'Fraud',
  LEGITIMATE: 'Legitimate',
  INCONCLUSIVE: 'Inconclusive',
};

const TYPOLOGY_COPY: Record<(typeof TYPOLOGIES)[number], string> = {
  STRUCTURING: 'Structuring',
  MULE_FAN_IN: 'Mule fan-in',
  DORMANT_REACTIVATION: 'Dormant reactivation',
  ACCOUNT_TAKEOVER: 'Account takeover',
  NIGHT_BURST: 'Night burst',
  LAYERING: 'Layering',
  OTHER: 'Other',
};

/**
 * §16.2 — structured feedback on a terminal status.
 *
 * Closing a case produces the one thing the platform cannot generate for
 * itself: a labelled example. Free text cannot be trained on, so this captures
 * structure alongside the note rather than instead of it.
 */
export function FeedbackBlock({
  value,
  onChange,
  explanation,
  fraudProbability,
  disabled,
}: {
  value: FeedbackFormValues;
  onChange: (next: FeedbackFormValues) => void;
  explanation: readonly Reason[];
  fraudProbability: number;
  disabled?: boolean;
}) {
  const [signalDraft, setSignalDraft] = useState('');

  /**
   * Pre-fill the driver options with the top three SHAP features already on
   * screen — UNCHECKED. Checking them by default would manufacture agreement
   * between analyst and model, which is exactly the signal we are trying to
   * measure.
   */
  const suggestedDrivers = useMemo(
    () =>
      [...explanation]
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
        .slice(0, 3)
        .map((r) => r.feature),
    [explanation],
  );

  const agreement = computeModelAgreement(value.true_label, fraudProbability);

  // Derived, read-only, and shown live as the analyst picks a label.
  useEffect(() => {
    // no-op: `model_agreed` is computed at submit time from the same helper.
  }, [agreement]);

  const toggleDriver = (feature: string) => {
    const next = value.decision_drivers.includes(feature)
      ? value.decision_drivers.filter((d) => d !== feature)
      : [...value.decision_drivers, feature];
    onChange({ ...value, decision_drivers: next });
  };

  const addSignal = () => {
    const trimmed = signalDraft.trim();
    if (!trimmed || value.missing_signals.includes(trimmed)) return;
    if (value.missing_signals.length >= 10) return;
    onChange({ ...value, missing_signals: [...value.missing_signals, trimmed] });
    setSignalDraft('');
  };

  return (
    <div className="space-y-5 border border-ultra p-5">
      <div>
        <p className="mono-label mb-2 text-ultra">Case feedback — required to close</p>
        <p className="text-[14px] leading-relaxed text-ink-2">
          This becomes a training label. It is the only new ground truth the platform gets.
        </p>
      </div>

      <div>
        <span className="mono-label mb-2 block text-ink-3">Outcome</span>
        <div className="grid gap-px bg-rule sm:grid-cols-3">
          {TRUE_LABELS.map((label) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...value, true_label: label })}
              className={cx(
                'bg-surface px-3 py-3 font-mono text-[11px] uppercase tracking-tag transition-colors',
                value.true_label === label ? 'bg-ultra text-on-ultra' : 'text-ink-2 hover:bg-paper',
              )}
            >
              {LABEL_COPY[label]}
            </button>
          ))}
        </div>
        {value.true_label === 'INCONCLUSIVE' ? (
          <p className="mt-2 text-[13px] text-ink-3">
            Recorded as uncertain. Better than a confident wrong label — a forced binary answer
            poisons the training set.
          </p>
        ) : null}
      </div>

      {/* Model agreement, derived and shown live. Analysts spot patterns here
          faster than any report will surface them. */}
      <div
        className={cx(
          'flex items-center justify-between gap-4 border px-4 py-3',
          agreement === null && 'border-rule',
          agreement === true && 'border-sage',
          agreement === false && 'border-amber',
        )}
      >
        <span className="mono-label text-ink-3">Model</span>
        <span
          className={cx(
            'font-mono text-[11px] uppercase tracking-tag',
            agreement === null && 'text-ink-3',
            agreement === true && 'text-sage',
            agreement === false && 'text-amber',
          )}
        >
          {agreement === null
            ? 'Not comparable'
            : agreement
              ? 'Model agreed'
              : 'Model disagreed'}
        </span>
        <span className="num font-mono text-[11px] tabular-nums text-ink-3">
          {formatProbability(fraudProbability)}% vs {RISK_THRESHOLDS.HIGH.toFixed(2)}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="fb-confidence" className="mono-label mb-2 block text-ink-3">
            Confidence
          </label>
          <select
            id="fb-confidence"
            className="field"
            disabled={disabled}
            value={value.confidence}
            onChange={(e) =>
              onChange({ ...value, confidence: e.target.value as FeedbackFormValues['confidence'] })
            }
          >
            {CONFIDENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="fb-typology" className="mono-label mb-2 block text-ink-3">
            Typology
          </label>
          <select
            id="fb-typology"
            className="field"
            disabled={disabled}
            value={value.typology}
            onChange={(e) =>
              onChange({ ...value, typology: e.target.value as FeedbackFormValues['typology'] })
            }
          >
            {TYPOLOGIES.map((t) => (
              <option key={t} value={t}>
                {TYPOLOGY_COPY[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className="mono-label mb-2 block text-ink-3">What drove your decision</span>
        {suggestedDrivers.length === 0 ? (
          <p className="text-[13px] text-ink-3">
            The model returned no features for this case.
          </p>
        ) : (
          <div className="space-y-2">
            {suggestedDrivers.map((feature) => (
              <label key={feature} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  disabled={disabled}
                  className="h-4 w-4 accent-[color:var(--ultra)]"
                  checked={value.decision_drivers.includes(feature)}
                  onChange={() => toggleDriver(feature)}
                />
                <span className="font-mono text-[11px] uppercase tracking-tag text-ink-2">
                  {feature}
                </span>
              </label>
            ))}
          </div>
        )}
        <p className="mt-2 text-[13px] text-ink-3">
          Left unchecked on purpose. Where your reasons match the model&apos;s, it is reasoning the
          way you do; where they diverge, it may be right for the wrong reasons.
        </p>
      </div>

      <div>
        <label htmlFor="fb-signal" className="mono-label mb-2 block text-ink-3">
          Signals the model did not have
        </label>
        <div className="flex gap-2">
          <input
            id="fb-signal"
            className="field"
            disabled={disabled || value.missing_signals.length >= 10}
            placeholder="RECEIVER_ACCOUNT_AGE_DAYS"
            value={signalDraft}
            onChange={(e) => setSignalDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSignal();
              }
            }}
          />
          <button
            type="button"
            className="btn btn--ghost"
            disabled={disabled || !signalDraft.trim()}
            onClick={addSignal}
          >
            Add
          </button>
        </div>
        {value.missing_signals.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {value.missing_signals.map((signal) => (
              <li key={signal}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...value,
                      missing_signals: value.missing_signals.filter((s) => s !== signal),
                    })
                  }
                  className="tag hover:border-carmine hover:text-carmine"
                  title="Remove"
                >
                  {signal} ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 text-[13px] text-ink-3">
          If you could tell because of something the model cannot see, name it here. This is how
          new features get requested.
        </p>
      </div>
    </div>
  );
}
