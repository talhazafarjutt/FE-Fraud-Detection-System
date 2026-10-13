import { useQuery } from '@tanstack/react-query';
import { getRuleSettingsHistory } from '@/api/endpoints/islamic';
import type { SettingsVersion, ThresholdSpec } from '@/api/schemas/ruleSettings';
import { ApiErrorPanel, LoadingRows } from '@/components/ApiStates';
import { formatAbsolute, formatRelative } from '@/lib/format';
import { changeField, formatChangeValue, ruleSettingsHistoryKey } from './rules';

const HISTORY_LIMIT = 50;

/** Every version, newest first: who, when, why, and each field before → after. */
export function SettingsHistory({ schema }: { schema: readonly ThresholdSpec[] }) {
  const query = useQuery({
    queryKey: [...ruleSettingsHistoryKey, HISTORY_LIMIT],
    queryFn: ({ signal }) => getRuleSettingsHistory(HISTORY_LIMIT, signal),
  });

  return (
    <section aria-labelledby="settings-history" className="space-y-4">
      <div className="border-b border-rule pb-3">
        <h3
          id="settings-history"
          className="font-mono text-[13px] font-normal uppercase tracking-label text-ink"
        >
          History
        </h3>
        <p className="mt-1 text-[14px] text-ink-2">
          Every version and what it changed. Scores record the version they were made under.
        </p>
      </div>
      {query.isError ? (
        <ApiErrorPanel
          error={query.error}
          what="the settings history"
          scopeHint="alerts:read"
          onRetry={() => void query.refetch()}
        />
      ) : query.isPending ? (
        <LoadingRows rows={3} label="Loading settings history" />
      ) : query.data.length === 0 ? (
        <p className="text-[14px] text-ink-2">
          No changes yet — every rule runs with the shipped defaults (version 0).
        </p>
      ) : (
        <ol className="space-y-3">
          {query.data.map((version) => (
            <VersionEntry key={version.version} version={version} schema={schema} />
          ))}
        </ol>
      )}
    </section>
  );
}

function VersionEntry({
  version,
  schema,
}: {
  version: SettingsVersion;
  schema: readonly ThresholdSpec[];
}) {
  return (
    <li aria-label={`Version ${version.version}`} className="border border-rule bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule-soft px-5 py-3 font-mono text-[12px] text-ink-2">
        <span className="text-ink">Version {version.version}</span>
        {version.reset ? (
          <span className="inline-flex border border-ultra px-2 py-[3px] text-[10px] uppercase leading-none tracking-tag text-ultra">
            Reset to defaults
          </span>
        ) : null}
        <span>by {version.updated_by ?? 'unknown'}</span>
        {version.updated_at ? (
          <time dateTime={version.updated_at} title={formatAbsolute(version.updated_at)}>
            {formatRelative(version.updated_at)}
          </time>
        ) : null}
      </div>
      <div className="space-y-3 px-5 py-3">
        {version.reason ? (
          <p className="text-[14px] text-ink">
            <span className="mono-label mr-2 text-ink-3">Reason</span>
            {version.reason}
          </p>
        ) : null}
        {version.changes.length === 0 ? (
          <p className="text-[13px] text-ink-3">No field changed.</p>
        ) : (
          <ul className="space-y-1">
            {version.changes.map((change) => {
              const { kind, name } = changeField(change.field);
              return (
                <li
                  key={change.field}
                  className="flex flex-wrap items-baseline gap-x-2 font-mono text-[12px] text-ink-2"
                >
                  <span className="text-ink">{kind === 'mode' ? `${name} mode` : name}</span>
                  <span>{formatChangeValue(change.field, change.before, schema)}</span>
                  <span aria-hidden="true">→</span>
                  <span className="sr-only">to</span>
                  <span className="text-ink">
                    {formatChangeValue(change.field, change.after, schema)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}
