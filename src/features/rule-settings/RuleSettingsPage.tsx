import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRuleSettings, resetRuleSettings, updateRuleSettings } from '@/api/endpoints/islamic';
import {
  REASON_MAX,
  REASON_MIN,
  type RuleSettings,
  type ThresholdSpec,
} from '@/api/schemas/ruleSettings';
import { useAuth } from '@/auth/AuthProvider';
import { ApiErrorPanel, EmptyPanel, LoadingRows } from '@/components/ApiStates';
import { Button, SectionHeading, cx } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';
import { ISLAMIC_LAYER, useLayers, useMeta } from '@/features/layers/useMeta';
import { describeFailure } from '@/lib/problem';
import { FieldError, ModeControl, RuleCard, ThresholdField, VersionLine } from './parts';
import { PilotReport } from './PilotReport';
import {
  type Draft,
  RULES_MANAGE,
  atDefaults,
  changeCount,
  changeFrom,
  draftFrom,
  modeChanged,
  pilotReportKey,
  ruleNames,
  ruleSettingsHistoryKey,
  ruleSettingsKey,
  thresholdChanged,
  thresholdProblem,
} from './rules';
import { SettingsHistory } from './SettingsHistory';

/**
 * The Islamic layer's rules, per deployment: whether each is live (ACTIVE),
 * on trial (PILOT — recorded, never applied) or OFF, and the thresholds they
 * read. Anyone with alerts:read sees them; only rules:manage (a supervisor)
 * changes them, always with a reason, as a new audited version.
 */
export default function RuleSettingsPage() {
  const meta = useMeta();
  const layers = useLayers();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'pilot' ? 'pilot' : 'settings';
  const layerOn = layers.isActive(ISLAMIC_LAYER);

  return (
    <div className="space-y-8">
      <SectionHeading
        index="10"
        title="Rule settings"
        hint="How each Islamic rule behaves in this deployment: live, on trial or off, and the thresholds it reads. Every change is a new version, recorded with who made it and why."
      />

      {meta.isPending ? (
        <LoadingRows label="Loading rule settings" />
      ) : !layerOn ? (
        <EmptyPanel
          title="The Islamic layer is off"
          body="This deployment runs without the Islamic banking layer, so there are no layer rules to configure."
        />
      ) : (
        <>
          <nav
            className="flex gap-px border border-rule bg-rule"
            aria-label="Rule settings sections"
          >
            {(
              [
                ['settings', 'Settings'],
                ['pilot', 'Pilot report'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setParams(key === 'settings' ? {} : { tab: key })}
                className={cx(
                  'flex-1 px-4 py-3 text-left font-mono text-[11px] uppercase tracking-label',
                  tab === key ? 'bg-ultra text-on-ultra' : 'bg-surface text-ink-2 hover:text-ink',
                )}
                aria-current={tab === key ? 'page' : undefined}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === 'settings' ? <SettingsTab /> : <PilotReport />}
        </>
      )}
    </div>
  );
}

function SettingsTab() {
  const { hasScope } = useAuth();
  const canEdit = hasScope(RULES_MANAGE);
  const query = useQuery({
    queryKey: ruleSettingsKey,
    queryFn: ({ signal }) => getRuleSettings(signal),
    // A refetch on focus would swap the version out from under an open edit.
    refetchOnWindowFocus: false,
  });

  if (query.isError) {
    return (
      <ApiErrorPanel
        error={query.error}
        what="the rule settings"
        scopeHint="alerts:read"
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isPending) return <LoadingRows label="Loading rule settings" />;

  const settings = query.data;
  return (
    <div className="space-y-8">
      {canEdit ? (
        // Keyed by version: a draft belongs to the version it was made against.
        <SettingsEditor key={settings.version} settings={settings} />
      ) : (
        <>
          <div className="space-y-2">
            <VersionLine settings={settings} />
            <p className="font-mono text-[11px] uppercase tracking-label text-ink-3">
              Read-only — only a supervisor (rules:manage) can change these settings.
            </p>
          </div>
          <RuleGrid settings={settings} draft={null} />
        </>
      )}
      <SettingsHistory schema={settings.schema} />
    </div>
  );
}

/** Thresholds only one rule reads sit on its card; the rest are listed once. */
function splitThresholds(settings: RuleSettings) {
  const own = new Map<string, ThresholdSpec[]>();
  const sharedBy = new Map<string, string[]>();
  const shared: ThresholdSpec[] = [];
  for (const spec of settings.schema) {
    if (spec.rules.length === 1) {
      const rule = spec.rules[0]!;
      own.set(rule, [...(own.get(rule) ?? []), spec]);
    } else {
      shared.push(spec);
      for (const rule of spec.rules) sharedBy.set(rule, [...(sharedBy.get(rule) ?? []), spec.name]);
    }
  }
  return { own, shared, sharedBy };
}

interface Editing {
  draft: Draft;
  setMode: (rule: string, mode: string) => void;
  setValue: (name: string, text: string) => void;
  errors: Record<string, string>;
  /** Field names the user has touched, so an untouched field shows no client-side complaint. */
  touched: ReadonlySet<string>;
}

function RuleGrid({ settings, draft: editing }: { settings: RuleSettings; draft: Editing | null }) {
  const { own, shared, sharedBy } = useMemo(() => splitThresholds(settings), [settings]);
  const draft = editing?.draft ?? draftFrom(settings);

  const thresholdField = (spec: ThresholdSpec, usedBy?: readonly string[]) => {
    const text = draft.values[spec.name] ?? '';
    const key = `thresholds.${spec.name}`;
    const error =
      editing?.errors[key] ?? (editing?.touched.has(key) ? thresholdProblem(text, spec) : null);
    return (
      <ThresholdField
        key={spec.name}
        spec={spec}
        saved={settings.thresholds[spec.name] ?? spec.default}
        text={text}
        changed={thresholdChanged(settings, draft, spec)}
        onChange={editing ? (next) => editing.setValue(spec.name, next) : undefined}
        error={error}
        usedBy={usedBy}
      />
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {ruleNames(settings).map((rule) => {
          const specs = own.get(rule) ?? [];
          const mode = draft.modes[rule] ?? settings.modes[rule] ?? 'ACTIVE';
          const changed =
            modeChanged(settings, draft, rule) ||
            specs.some((spec) => thresholdChanged(settings, draft, spec));
          return (
            <RuleCard
              key={rule}
              rule={rule}
              kind={settings.rule_kinds[rule]}
              changed={changed}
              shared={sharedBy.get(rule) ?? []}
              modeControl={
                <ModeControl
                  rule={rule}
                  mode={mode}
                  saved={settings.modes[rule] ?? 'ACTIVE'}
                  onChange={editing ? (next) => editing.setMode(rule, next) : undefined}
                  error={editing?.errors[`modes.${rule}`]}
                />
              }
            >
              {specs.length > 0 ? (
                <div className="space-y-4">{specs.map((spec) => thresholdField(spec))}</div>
              ) : (sharedBy.get(rule) ?? []).length === 0 ? (
                <p className="text-[13px] text-ink-3">
                  No thresholds: it fires on the facts alone.
                </p>
              ) : null}
            </RuleCard>
          );
        })}
      </div>

      {shared.length > 0 ? (
        <section aria-label="Shared thresholds" className="border border-rule bg-surface">
          <div className="border-b border-rule px-5 py-4">
            <h3 className="font-mono text-[13px] font-normal text-ink">Shared thresholds</h3>
            <p className="mt-1 text-[14px] text-ink-2">
              Read by more than one rule; a change here moves every rule listed beside it.
            </p>
          </div>
          <div className="grid gap-6 px-5 py-4 lg:grid-cols-2">
            {shared.map((spec) => thresholdField(spec, spec.rules))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

const CONFLICT = 409;
const INVALID = 422;

function SettingsEditor({ settings }: { settings: RuleSettings }) {
  const queryClient = useQueryClient();
  const toast = useToasts();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(settings));
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [resetting, setResetting] = useState(false);

  const count = changeCount(settings, draft);

  const clearError = (key: string) =>
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });

  const editing: Editing = {
    draft,
    errors,
    touched,
    setMode: (rule, mode) => {
      setDraft((current) => ({ ...current, modes: { ...current.modes, [rule]: mode } }));
      clearError(`modes.${rule}`);
    },
    setValue: (name, text) => {
      setDraft((current) => ({ ...current, values: { ...current.values, [name]: text } }));
      setTouched((current) => new Set(current).add(`thresholds.${name}`));
      clearError(`thresholds.${name}`);
    },
  };

  const applied = (next: RuleSettings, message: string) => {
    queryClient.setQueryData(ruleSettingsKey, next);
    void queryClient.invalidateQueries({ queryKey: ruleSettingsHistoryKey });
    void queryClient.invalidateQueries({ queryKey: pilotReportKey });
    toast.push({ tone: 'success', title: message });
  };

  const save = useMutation({
    mutationFn: updateRuleSettings,
    onSuccess: (next) => applied(next, `Saved as version ${next.version}`),
    onError: (error) => {
      const failure = describeFailure(error);
      if (failure.status === CONFLICT) {
        setConflict(true);
        return;
      }
      if (failure.status === INVALID && failure.fieldErrors) {
        const mapped: Record<string, string> = {};
        const general: string[] = [];
        for (const { field, message } of failure.fieldErrors) {
          if (field === 'reason' || field.startsWith('modes.') || field.startsWith('thresholds.')) {
            mapped[field] = message;
          } else {
            general.push(message);
          }
        }
        setErrors(mapped);
        setFormError(general.length > 0 ? general.join(' ') : null);
        return;
      }
      setFormError(failure.detail || failure.title);
    },
  });

  const discard = () => {
    setDraft(draftFrom(settings));
    setTouched(new Set());
    setErrors({});
    setFormError(null);
  };

  const reload = () => {
    setConflict(false);
    void queryClient.invalidateQueries({ queryKey: ruleSettingsKey });
    void queryClient.invalidateQueries({ queryKey: ruleSettingsHistoryKey });
    discard();
    setReason('');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (count === 0 || save.isPending) return;
    const problems: Record<string, string> = {};
    for (const spec of settings.schema) {
      if (!thresholdChanged(settings, draft, spec)) continue;
      const problem = thresholdProblem(draft.values[spec.name] ?? '', spec);
      if (problem) problems[`thresholds.${spec.name}`] = problem;
    }
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN) {
      problems['reason'] =
        `Give a reason of at least ${REASON_MIN} characters — it is recorded with the version.`;
    }
    setFormError(null);
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      return;
    }
    setErrors({});
    save.mutate(changeFrom(settings, draft, trimmed));
  };

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-8" aria-label="Rule settings">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <VersionLine settings={settings} />
          <Button
            variant="ghost"
            onClick={() => setResetting(true)}
            disabled={atDefaults(settings)}
            title={
              atDefaults(settings)
                ? 'Every rule and threshold is already at its default'
                : undefined
            }
          >
            Reset to defaults
          </Button>
        </div>

        {conflict ? (
          <div role="alert" className="border border-carmine bg-surface p-5">
            <p className="mono-label mb-2 text-carmine">Changed while you were editing</p>
            <p className="mb-4 text-ink-2">
              Someone saved a newer version of these settings first, so yours was not applied.
              Reload to see the version in force — your unsaved changes will be discarded.
            </p>
            <Button onClick={reload}>Reload settings</Button>
          </div>
        ) : null}

        <RuleGrid settings={settings} draft={editing} />

        <section
          aria-label="Save changes"
          className={cx(
            'sticky bottom-0 z-10 space-y-4 border bg-surface p-5',
            count > 0 ? 'border-amber' : 'border-rule',
          )}
        >
          <p className="mono-label text-ink-2">
            {count === 0
              ? 'No unsaved changes'
              : `${count} unsaved ${count === 1 ? 'change' : 'changes'} — saved as version ${settings.version + 1}`}
          </p>
          <div>
            <label htmlFor="settings-reason" className="mono-label mb-2 block text-ink-3">
              Reason for this change
            </label>
            <textarea
              id="settings-reason"
              className="field"
              rows={2}
              maxLength={REASON_MAX}
              value={reason}
              placeholder="Recorded with the version, e.g. “Trial the 14-day early-claim window”"
              onChange={(event) => {
                setReason(event.target.value);
                clearError('reason');
              }}
              aria-invalid={errors['reason'] ? true : undefined}
              aria-describedby={errors['reason'] ? 'settings-reason-error' : undefined}
            />
            <FieldError id="settings-reason-error" message={errors['reason']} />
          </div>
          {formError ? (
            <p role="alert" className="text-[14px] text-carmine">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={count === 0 || save.isPending}>
              {save.isPending ? 'Saving' : 'Save changes'}
            </Button>
            <Button variant="ghost" onClick={discard} disabled={count === 0 || save.isPending}>
              Discard
            </Button>
          </div>
        </section>
      </form>

      {resetting ? (
        <ResetDialog
          version={settings.version}
          onCancel={() => setResetting(false)}
          onDone={(next) => {
            setResetting(false);
            applied(next, `Reset to defaults as version ${next.version}`);
          }}
        />
      ) : null}
    </>
  );
}

function ResetDialog({
  version,
  onCancel,
  onDone,
}: {
  version: number;
  onCancel: () => void;
  onDone: (next: RuleSettings) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: resetRuleSettings,
    onSuccess: onDone,
    onError: (failure) => {
      const described = describeFailure(failure);
      const reasonError = described.fieldErrors?.find((entry) => entry.field === 'reason');
      setError(
        described.status === CONFLICT
          ? 'Someone saved a newer version first. Cancel, reload the page and try again.'
          : (reasonError?.message ?? described.detail ?? described.title),
      );
    },
  });

  const confirm = () => {
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN) {
      setError(
        `Give a reason of at least ${REASON_MIN} characters — it is recorded with the version.`,
      );
      return;
    }
    setError(null);
    reset.mutate(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-overlay p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-title"
    >
      <div className="w-full max-w-md border border-rule bg-surface">
        <div className="border-b border-rule px-6 py-4">
          <p className="eyebrow !mb-0">Confirm reset</p>
        </div>
        <div className="space-y-5 p-6">
          <h3 id="reset-title">Reset every rule to its defaults?</h3>
          <p className="text-ink-2">
            Every rule goes back to Active and every threshold to the value the layer shipped with.
            It is saved as version {version + 1}; the history keeps every earlier version.
          </p>
          <div>
            <label htmlFor="reset-reason" className="mono-label mb-2 block text-ink-3">
              Reason
            </label>
            <textarea
              id="reset-reason"
              className="field"
              rows={2}
              maxLength={REASON_MAX}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
            />
            <FieldError message={error} />
          </div>
          <div className="flex gap-3">
            <Button variant="danger" onClick={confirm} disabled={reset.isPending}>
              {reset.isPending ? 'Resetting' : 'Reset to defaults'}
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={reset.isPending}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
