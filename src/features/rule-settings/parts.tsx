import type { ReactNode } from 'react';
import {
  RULE_MODES,
  type RuleSettings,
  type ThresholdSpec,
  isRuleMode,
} from '@/api/schemas/ruleSettings';
import { cx } from '@/components/primitives';
import { formatAbsolute, formatRelative } from '@/lib/format';
import {
  MODE_HINT,
  MODE_LABEL,
  formatThreshold,
  isShare,
  kindLabel,
  modeLabel,
  rangeText,
  ruleMeaning,
  unitSuffix,
} from './rules';

/** "Version 3 · changed by Supervisor · 2 hours ago · “reason”". */
export function VersionLine({ settings }: { settings: RuleSettings }) {
  if (settings.version === 0 || !settings.updated_at) {
    return (
      <p className="font-mono text-[12px] text-ink-2" aria-label="Settings version">
        Version {settings.version} · the shipped defaults, never changed
      </p>
    );
  }
  return (
    <p className="font-mono text-[12px] text-ink-2" aria-label="Settings version">
      Version {settings.version} · changed by {settings.updated_by ?? 'unknown'} ·{' '}
      <time dateTime={settings.updated_at} title={formatAbsolute(settings.updated_at)}>
        {formatRelative(settings.updated_at)}
      </time>
      {settings.reason ? <> · “{settings.reason}”</> : null}
    </p>
  );
}

const MODE_CHIP: Record<string, string> = {
  ACTIVE: 'border-sage text-sage',
  PILOT: 'border-dashed border-amber text-amber',
  OFF: 'border-rule text-ink-3',
};

export function ModeChip({ mode }: { mode: string }) {
  return (
    <span
      className={cx(
        'inline-flex border px-2 py-1 font-mono text-[10px] uppercase leading-none tracking-tag',
        MODE_CHIP[mode] ?? 'border-rule text-ink-2',
      )}
      title={isRuleMode(mode) ? MODE_HINT[mode] : undefined}
    >
      {modeLabel(mode)}
    </span>
  );
}

export function KindTag({ kind }: { kind: string | undefined }) {
  return (
    <span
      className={cx(
        'inline-flex border px-2 py-1 font-mono text-[10px] uppercase leading-none tracking-tag',
        kind === 'set_aside' ? 'border-ultra text-ultra' : 'border-ink-3 text-ink-2',
      )}
    >
      {kindLabel(kind)}
    </span>
  );
}

export function FieldError({ id, message }: { id?: string; message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p
      id={id}
      className="mt-2 font-mono text-[11px] uppercase tracking-tag text-carmine"
      role="alert"
    >
      {message}
    </p>
  );
}

export function ChangedTag() {
  return (
    <span className="inline-flex border border-amber px-2 py-[3px] font-mono text-[10px] uppercase leading-none tracking-tag text-amber">
      Changed
    </span>
  );
}

/**
 * One rule: what it looks for, what kind of rule it is, its mode, and the
 * thresholds only it reads. `children` holds those thresholds' fields.
 */
export function RuleCard({
  rule,
  kind,
  changed,
  modeControl,
  shared,
  children,
}: {
  rule: string;
  kind: string | undefined;
  changed: boolean;
  modeControl: ReactNode;
  /** Thresholds this rule reads that other rules read too (listed once, below). */
  shared: readonly string[];
  children: ReactNode;
}) {
  const meaning = ruleMeaning(rule);
  return (
    <article
      aria-label={rule}
      data-changed={changed ? 'true' : undefined}
      className={cx('flex flex-col border bg-surface', changed ? 'border-amber' : 'border-rule')}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-mono text-[13px] font-normal text-ink">{rule}</h3>
          {meaning ? <p className="mt-1 text-[14px] text-ink-2">{meaning}</p> : null}
        </div>
        <KindTag kind={kind} />
      </header>
      <div className="flex-1 space-y-5 px-5 py-4">
        {modeControl}
        {children}
        {shared.length > 0 ? (
          <p className="text-[13px] text-ink-3">
            Also reads the shared {shared.length === 1 ? 'threshold' : 'thresholds'}{' '}
            {shared.map((name, index) => (
              <span key={name}>
                {index > 0 ? ', ' : null}
                <a
                  href={`#threshold-${name}`}
                  className="font-mono text-[12px] underline decoration-rule underline-offset-2 hover:text-ultra"
                >
                  {name}
                </a>
              </span>
            ))}{' '}
            below.
          </p>
        ) : null}
      </div>
    </article>
  );
}

/** The mode, as a three-way switch for an editor, as a chip for everyone else. */
export function ModeControl({
  rule,
  mode,
  saved,
  onChange,
  error,
}: {
  rule: string;
  mode: string;
  saved: string;
  onChange?: ((mode: string) => void) | undefined;
  error?: string | null | undefined;
}) {
  const changed = mode !== saved;
  if (!onChange) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="mono-label text-ink-3">Mode</span>
        <ModeChip mode={mode} />
        {isRuleMode(mode) ? (
          <span className="text-[13px] text-ink-3">{MODE_HINT[mode]}</span>
        ) : null}
      </div>
    );
  }
  const errorId = `mode-${rule}-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mono-label mb-2 flex items-center gap-2 text-ink-3">
        Mode {changed ? <ChangedTag /> : null}
      </legend>
      <div
        role="radiogroup"
        aria-label={`${rule} mode`}
        className={cx('flex gap-px border bg-rule', changed ? 'border-amber' : 'border-rule')}
      >
        {RULE_MODES.map((option) => {
          const selected = mode === option;
          return (
            <label
              key={option}
              className={cx(
                'flex-1 cursor-pointer px-3 py-2 text-center font-mono text-[11px] uppercase tracking-label focus-within:outline focus-within:outline-2 focus-within:outline-ultra',
                selected ? 'bg-ultra text-on-ultra' : 'bg-surface text-ink-2 hover:text-ink',
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={`mode-${rule}`}
                value={option}
                checked={selected}
                onChange={() => onChange(option)}
              />
              {MODE_LABEL[option]}
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] text-ink-3">
        {isRuleMode(mode) ? MODE_HINT[mode] : mode}
        {changed ? ` · was ${modeLabel(saved)}` : ''}
      </p>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}

/**
 * One threshold: its value (an input for an editor), unit, default, allowed
 * range and what it does. A `share` is edited as a percentage.
 */
export function ThresholdField({
  spec,
  saved,
  text,
  changed,
  onChange,
  error,
  usedBy,
}: {
  spec: ThresholdSpec;
  saved: number;
  /** What the input holds, in display units. */
  text: string;
  changed: boolean;
  onChange?: ((text: string) => void) | undefined;
  error?: string | null | undefined;
  /** For a shared threshold: the rules that read it. */
  usedBy?: readonly string[] | undefined;
}) {
  const id = `threshold-${spec.name}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const suffix = unitSuffix(spec.unit);
  return (
    <div
      id={onChange ? undefined : id}
      data-changed={changed ? 'true' : undefined}
      className={cx('border-l-2 pl-4', changed ? 'border-l-amber' : 'border-l-rule-soft')}
    >
      <div className="flex flex-wrap items-center gap-2">
        {onChange ? (
          <label htmlFor={id} className="font-mono text-[12px] text-ink">
            {spec.name}
          </label>
        ) : (
          <span className="font-mono text-[12px] text-ink">{spec.name}</span>
        )}
        {changed ? <ChangedTag /> : null}
      </div>
      {onChange ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            id={id}
            className={cx(
              'field !w-32',
              error ? '!border-carmine' : changed ? '!border-amber' : '',
            )}
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={cx(hintId, error ? errorId : null)}
          />
          {suffix ? <span className="font-mono text-[12px] text-ink-3">{suffix}</span> : null}
        </div>
      ) : (
        <p className="mt-1 font-mono text-[15px] tabular-nums text-ink">
          {formatThreshold(saved, spec.unit)}
        </p>
      )}
      <p id={hintId} className="mt-2 font-mono text-[11px] text-ink-3">
        Default {formatThreshold(spec.default, spec.unit)} · allowed {rangeText(spec)}
        {changed ? ` · was ${formatThreshold(saved, spec.unit)}` : ''}
        {isShare(spec.unit) && onChange ? ' · enter a percentage' : ''}
      </p>
      {spec.help ? <p className="mt-1 text-[13px] text-ink-2">{spec.help}</p> : null}
      {usedBy && usedBy.length > 0 ? (
        <p className="mt-1 font-mono text-[11px] text-ink-3">Used by {usedBy.join(', ')}</p>
      ) : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
