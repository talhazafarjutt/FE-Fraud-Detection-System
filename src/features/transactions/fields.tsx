import type { ReactNode } from 'react';
import type { FieldError } from 'react-hook-form';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: FieldError | undefined;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mono-label mb-2 block text-ink-3">
        {label}
      </label>
      {children}
      {error?.message ? (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-tag text-carmine">
          {error.message}
        </p>
      ) : hint ? (
        <p className="mt-2 text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Numbered section, matching the marketing site's 01–07 device. Sections are
 * separated by a full-width 1px rule rather than by card gaps.
 */
export function FormSection({
  index,
  title,
  description,
  children,
}: {
  index: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-rule pt-8">
      <div className="mb-6">
        <p className="eyebrow !mb-2">
          {index} — {title}
        </p>
        {description ? <p className="max-w-2xl text-ink-2">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
