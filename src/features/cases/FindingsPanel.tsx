import { useEffect, useState } from 'react';
import { FINDINGS_LIMIT, findingsLocked } from '@/api/schemas/cases';
import { Button, Eyebrow, Panel } from '@/components/primitives';
import { UserName } from '@/features/users/UserName';
import { formatAbsolute, formatRelative } from '@/lib/format';

export interface FindingsPanelProps {
  findings: string | null | undefined;
  findingsBy: string | null | undefined;
  findingsAt: string | null | undefined;
  status: string;
  /** Holds `alerts:update`. */
  canEdit: boolean;
  saving: boolean;
  error?: string | undefined;
  onSave: (findings: string) => void;
}

/**
 * What the investigation established, in the analyst's words. Editable until
 * the case is concluded; the verdict then keeps a copy, so they are frozen.
 */
export function FindingsPanel({
  findings,
  findingsBy,
  findingsAt,
  status,
  canEdit,
  saving,
  error,
  onSave,
}: FindingsPanelProps) {
  const saved = findings ?? '';
  const [draft, setDraft] = useState(saved);

  useEffect(() => setDraft(saved), [saved]);

  const locked = findingsLocked(status);
  const editable = canEdit && !locked;
  const dirty = draft.trim() !== saved;

  return (
    <Panel className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow className="!mb-1">Analyst findings</Eyebrow>
          <p className="max-w-2xl text-[13px] text-ink-2">
            What the investigation established. Stored with the verdict when the case is concluded.
          </p>
        </div>
        {findingsBy || findingsAt ? (
          <p className="font-mono text-[11px] text-ink-3">
            {findingsBy ? (
              <>
                by <UserName id={findingsBy} />
              </>
            ) : null}
            {findingsBy && findingsAt ? ' · ' : null}
            {findingsAt ? (
              <span title={formatAbsolute(findingsAt)}>{formatRelative(findingsAt)}</span>
            ) : null}
          </p>
        ) : null}
      </div>

      {editable ? (
        <div className="space-y-3">
          <textarea
            aria-label="Analyst findings"
            className="field min-h-28 font-body text-[15px] tracking-normal"
            maxLength={FINDINGS_LIMIT}
            placeholder="What you found, and how you know it."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="num font-mono text-[11px] tabular-nums text-ink-3">
              {draft.length}/{FINDINGS_LIMIT}
            </span>
            <Button onClick={() => onSave(draft.trim())} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      ) : saved ? (
        <p className="max-w-3xl whitespace-pre-wrap text-ink-2">{saved}</p>
      ) : (
        <p className="text-ink-3">No findings recorded yet.</p>
      )}

      {locked ? (
        <p className="mt-3 text-[12px] text-ink-3">
          Frozen once the case is concluded. Reopen the case to change them.
        </p>
      ) : !canEdit ? (
        <p className="mt-3 text-[12px] text-ink-3">
          Recording findings requires <code>alerts:update</code>.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 border border-carmine px-3 py-2 text-carmine" role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
