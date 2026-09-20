import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Eyebrow, Panel, cx } from '@/components/primitives';
import { STAGES, capabilitiesFor, isLit, restrictionsFor, roleSummary } from './stages';
import { isPanelCollapsed, setPanelCollapsed } from './introState';

/**
 * The persistent "Your workflow" panel on the dashboard.
 *
 * Always present, never fully gone: dismissing it collapses it to a single
 * line rather than removing it, because the question it answers ("what am I
 * supposed to do here?") comes back on the second day too.
 */
export function FlowPanel() {
  const { scopes, session, hasScope } = useAuth();
  const [collapsed, setCollapsed] = useState(isPanelCollapsed);

  const collapse = (value: boolean) => {
    setCollapsed(value);
    setPanelCollapsed(value);
  };

  const lit = STAGES.filter((stage) => isLit(stage, scopes));
  const dimmed = STAGES.filter((stage) => !isLit(stage, scopes));
  const restrictions = restrictionsFor(scopes);
  const capabilities = capabilitiesFor(scopes);

  if (collapsed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border border-rule bg-surface px-5 py-3">
        <p className="text-[13px] text-ink-2">
          <span className="mono-label mr-3 text-ink-3">Your workflow</span>
          {lit.length} of {STAGES.length} stages are yours
          {!hasScope('alerts:read:all') && session?.team ? ` · ${session.team}` : ''}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="font-mono text-[11px] uppercase tracking-label text-ink-3 hover:text-ultra"
            onClick={() => collapse(false)}
          >
            Expand
          </button>
          <Link
            to="/flow"
            className="font-mono text-[11px] uppercase tracking-label text-ink-3 hover:text-ultra"
          >
            Full view →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Panel className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow className="!mb-2">Your workflow</Eyebrow>
          <p className="max-w-2xl text-ink">{roleSummary(scopes)}</p>
        </div>
        <button
          type="button"
          className="font-mono text-[11px] uppercase tracking-label text-ink-3 hover:text-ultra"
          onClick={() => collapse(true)}
        >
          Dismiss
        </button>
      </div>

      <ol className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-2">
        {STAGES.filter((s) => !s.branch).map((stage, index) => {
          const on = isLit(stage, scopes);
          return (
            <li key={stage.id} className="flex items-center gap-2">
              {index > 0 ? (
                <span className="text-ink-3" aria-hidden="true">
                  →
                </span>
              ) : null}
              {on && stage.to ? (
                <Link
                  to={stage.to}
                  className="border border-ultra px-2 py-1 font-mono text-[11px] uppercase tracking-tag text-ultra hover:bg-ultra hover:text-on-ultra"
                >
                  {stage.title}
                </Link>
              ) : (
                <span
                  title={on ? stage.blurb : stage.locked}
                  className={cx(
                    'border px-2 py-1 font-mono text-[11px] uppercase tracking-tag',
                    on ? 'border-rule text-ink-2' : 'border-rule-soft text-ink-3',
                  )}
                >
                  {on ? '' : '🔒 '}
                  {stage.title}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="mono-label mb-2 text-ink-3">Yours</p>
          <ul className="space-y-1 text-[13px] text-ink-2">
            {capabilities.slice(0, 4).map((capability) => (
              <li key={capability.scope}>{capability.does}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mono-label mb-2 text-ink-3">
            {restrictions.length ? 'Not yours, and why' : 'Nothing is closed to you'}
          </p>
          <ul className="space-y-1 text-[13px] text-ink-3">
            {restrictions.map((restriction) => (
              <li key={restriction.scope}>{restriction.cannot}</li>
            ))}
            {dimmed.length === 0 ? <li>Every stage of the pipeline is yours.</li> : null}
          </ul>
        </div>
      </div>

      <div className="mt-5">
        <Link to="/flow" className="btn btn--ghost">
          See the whole flow
        </Link>
      </div>
    </Panel>
  );
}

