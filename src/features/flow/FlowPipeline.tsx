import { Link } from 'react-router-dom';
import { STAGES, type Stage, isLit } from './stages';
import { cx } from '@/components/primitives';

/**
 * The pipeline, drawn.
 *
 * A token travels it on a slow loop so the direction of flow is obvious
 * without reading. That animation is decoration only: `prefers-reduced-motion`
 * removes it and the same diagram still says everything it needs to, because
 * every stage carries its text.
 */
export function FlowPipeline({
  scopes,
  counts,
}: {
  scopes: readonly string[];
  counts: Partial<Record<Stage['id'], string>>;
}) {
  const main = STAGES.filter((s) => !s.branch);
  const branches = STAGES.filter((s) => s.branch);

  return (
    <div className="space-y-6">
      <ol className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
        {main.map((stage, index) => (
          <StageCard
            key={stage.id}
            stage={stage}
            lit={isLit(stage, scopes)}
            index={index + 1}
            {...(counts[stage.id] ? { count: counts[stage.id] as string } : {})}
          />
        ))}
      </ol>

      {/* The flow line. Purely visual — the order is already in the list above. */}
      <div className="relative h-px bg-rule" aria-hidden="true">
        <span className="civitas-flow-token absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-ultra" />
      </div>

      <ol className="grid gap-px border border-rule bg-rule sm:grid-cols-2">
        {branches.map((stage) => (
          <StageCard key={stage.id} stage={stage} lit={isLit(stage, scopes)} branch {...(counts[stage.id] ? { count: counts[stage.id] as string } : {})} />
        ))}
      </ol>

      <style>{`
        @keyframes civitas-flow {
          from { left: 0%; opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          to   { left: 100%; opacity: 0; }
        }
        .civitas-flow-token { animation: civitas-flow 9s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .civitas-flow-token { animation: none; left: 0; opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

function StageCard({
  stage,
  lit,
  index,
  count,
  branch,
}: {
  stage: Stage;
  lit: boolean;
  index?: number;
  count?: string;
  branch?: boolean;
}) {
  const body = (
    <>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span
          className={cx(
            'font-mono text-[11px] uppercase tracking-label',
            lit ? 'text-ultra' : 'text-ink-3',
          )}
        >
          {branch ? '↳' : String(index).padStart(2, '0')} {stage.title}
        </span>
        {count ? (
          <span className="font-mono text-[12px] tabular-nums text-ink-2">{count}</span>
        ) : null}
      </div>
      <p className={cx('text-[13px]', lit ? 'text-ink-2' : 'text-ink-3')}>{stage.blurb}</p>
      {!lit ? (
        <p className="mt-3 border-t border-rule-soft pt-3 text-[12px] text-ink-3">
          <span aria-hidden="true">🔒 </span>
          {stage.locked}
        </p>
      ) : null}
    </>
  );

  const className = cx(
    'block h-full p-5',
    lit ? 'bg-surface' : 'bg-paper opacity-70',
    lit && stage.to && 'hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-[var(--ultra)]',
  );

  return (
    <li className="contents">
      {lit && stage.to ? (
        <Link to={stage.to} className={className}>
          {body}
        </Link>
      ) : (
        <div className={className} aria-disabled={!lit}>
          {body}
        </div>
      )}
    </li>
  );
}
