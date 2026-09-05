import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Mono uppercase micro-label. The site's signature element. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('eyebrow', className)}>{children}</p>;
}

/**
 * Numbered section header. The marketing site labels its sections 01–07 in
 * mono; carrying that in is a cheap, high-recognition detail.
 */
export function SectionHeading({
  index,
  title,
  hint,
  actions,
}: {
  index: string;
  title: string;
  hint?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
      <div>
        <Eyebrow className="!mb-2">
          {index} — {title}
        </Eyebrow>
        {hint ? <p className="max-w-2xl text-ink-2">{hint}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
};

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'btn',
        variant === 'ghost' && 'btn--ghost',
        variant === 'danger' && 'btn--danger',
        className,
      )}
    />
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('tag', className)}>{children}</span>;
}

/**
 * Depth comes from a 1px rule and the surface/paper contrast — never a shadow,
 * never a radius. A rounded card with a drop shadow is the clearest tell that
 * this console was not built by the same team as the marketing site.
 */
export function Panel({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div {...rest} className={cx('border border-rule bg-surface', className)}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse bg-rule-soft', className)} aria-hidden="true" />;
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="border border-rule bg-surface px-6 py-14 text-center">
      <p className="mono-label text-ink-3">{title}</p>
      {body ? <p className="mx-auto mt-3 max-w-md text-ink-2">{body}</p> : null}
    </div>
  );
}

/** Right-aligned tabular figure. Digits must line up down a column. */
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('num font-mono text-[12px] tabular-nums', className)}>{children}</span>
  );
}
