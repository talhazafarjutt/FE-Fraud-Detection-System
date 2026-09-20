import type { ReactNode } from 'react';
import { API_BASE_LABEL } from '@/api/client';
import { type ApiFailure, describeFailure } from '@/lib/problem';
import { Button, Eyebrow, Panel, Skeleton } from './primitives';

/**
 * The five states, rendered distinctly.
 *
 * Every one of these was, at some point, shown as the same "could not be
 * loaded" box — which is how a CORS preflight got reported as a dead API, and
 * how an empty team looked like a bug. They are not the same thing and they do
 * not get the same panel.
 *
 *   network → we never reached the server. Print the base URL we tried.
 *   http    → the server answered. Show what it said; 403/404 have meanings
 *             specific to this API and get specific wording.
 *   parse   → the server answered fine and we could not read it. Contract drift.
 *   empty   → nothing to show. NOT an error, and never styled as one.
 *   ok      → data.
 */

export function LoadingRows({ rows = 6, label }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only">{label ?? 'Loading'}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function Frame({
  tone,
  eyebrow,
  title,
  children,
  action,
}: {
  tone: 'error' | 'quiet';
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={
        tone === 'error' ? 'border border-carmine bg-surface p-8' : 'border border-rule bg-surface p-8'
      }
    >
      <Eyebrow className={tone === 'error' ? 'text-carmine' : undefined}>{eyebrow}</Eyebrow>
      <h2 className="mb-3">{title}</h2>
      <div className="mb-6 max-w-2xl space-y-3 text-ink-2">{children}</div>
      {action}
    </div>
  );
}

export interface ApiErrorPanelProps {
  error: unknown;
  /** What the user was trying to see, e.g. "the case list". */
  what: string;
  onRetry?: () => void;
  /** Extra guidance for a 403 — usually the scope that is missing. */
  scopeHint?: string;
}

export function ApiErrorPanel({ error, what, onRetry, scopeHint }: ApiErrorPanelProps) {
  const failure: ApiFailure = describeFailure(error);

  if (failure.kind === 'network') {
    return (
      <Frame tone="error" eyebrow="Cannot reach the API" title={`Nothing answered at ${API_BASE_LABEL}.`}>
        <p>
          We could not load {what} because no response came back at all — not an error response,
          no response.
        </p>
        <p>
          Three things look identical from here: the API is not running, <code>VITE_API_BASE_URL</code>{' '}
          points at the wrong backend, or the browser blocked the request before it left (CORS).
          Check that the backend is up and that the base URL above is the one you meant.
        </p>
        {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
      </Frame>
    );
  }

  if (failure.kind === 'parse') {
    return (
      <Frame
        tone="error"
        eyebrow="Contract drift"
        title="The API returned data this version cannot read."
      >
        <p>
          The request succeeded. The response did not match what this build expects, which means
          the backend contract has changed.
        </p>
        <p className="font-mono text-[12px] text-ink-3">{failure.detail}</p>
        <p>
          Regenerate the committed types with <code>npm run schema:gen</code> and read the diff.
        </p>
      </Frame>
    );
  }

  const { status } = failure;

  if (status === 403) {
    return (
      <Frame tone="quiet" eyebrow="Not permitted" title="Your account does not have permission for this.">
        <p>{failure.detail}</p>
        {scopeHint ? (
          <p>
            This screen needs the <code>{scopeHint}</code> scope. Permissions are granted per role
            by an administrator.
          </p>
        ) : null}
      </Frame>
    );
  }

  if (status === 404) {
    return (
      <Frame tone="quiet" eyebrow="Not found" title="Not found — it may belong to another team.">
        <p>
          This API answers 404 rather than 403 for something outside your team, so a missing record
          and one you are not cleared to see look the same from here.
        </p>
        <p className="text-ink-3">{failure.detail}</p>
      </Frame>
    );
  }

  return (
    <Frame tone="error" eyebrow={`Error ${status}`} title={failure.title}>
      <p>{failure.detail}</p>
      {failure.fieldErrors?.length ? (
        <ul className="space-y-1 font-mono text-[12px]">
          {failure.fieldErrors.map((f) => (
            <li key={f.field}>
              <span className="text-ink-3">{f.field}</span> — {f.message}
            </li>
          ))}
        </ul>
      ) : null}
      {failure.allowedTransitions?.length ? (
        <p>
          The server says the only moves available from here are{' '}
          <span className="font-mono">{failure.allowedTransitions.join(', ')}</span>.
        </p>
      ) : null}
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </Frame>
  );
}

/**
 * Empty is not an error. It gets a quiet panel and says WHY it is empty where
 * that is knowable — "team-beta has no traffic yet" is information; a bare
 * "no results" reads as a bug.
 */
export function EmptyPanel({ title, body }: { title: string; body?: ReactNode }) {
  return (
    <Panel className="px-6 py-14 text-center">
      <p className="mono-label text-ink-3">{title}</p>
      {body ? <div className="mx-auto mt-3 max-w-md text-ink-2">{body}</div> : null}
    </Panel>
  );
}

/** Rows the API returned that we could not read. Counted, never hidden. */
export function SkippedRowsNotice({ skipped }: { skipped: number }) {
  if (skipped <= 0) return null;
  return (
    <p className="border border-amber px-3 py-2 font-mono text-[11px] uppercase tracking-label text-amber">
      {skipped} {skipped === 1 ? 'row' : 'rows'} skipped — the API returned{' '}
      {skipped === 1 ? 'a row' : 'rows'} this build could not read. The rest are shown.
    </p>
  );
}
