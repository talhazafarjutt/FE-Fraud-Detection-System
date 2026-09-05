import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, SchemaError } from '@/lib/problem';
import { cx } from './primitives';

export interface Toast {
  id: number;
  tone: 'info' | 'error' | 'success';
  title: string;
  detail?: string;
  /** Extra members from a problem+json body, e.g. allowed_transitions on a 409. */
  extras?: string[];
}

interface ToastContextValue {
  push: (toast: Omit<Toast, 'id'>) => void;
  pushError: (error: unknown, fallbackTitle?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function formatExtras(extras: Record<string, unknown>): string[] {
  return Object.entries(extras).map(([key, value]) => {
    const readable = Array.isArray(value) ? value.join(', ') : String(value);
    return `${key.replace(/_/g, ' ')}: ${readable}`;
  });
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...toast, id }]);
      setTimeout(() => dismiss(id), toast.tone === 'error' ? 9000 : 5000);
    },
    [dismiss],
  );

  const pushError = useCallback(
    (error: unknown, fallbackTitle = 'Request failed') => {
      if (error instanceof ApiError) {
        const extras = formatExtras(error.problem.extras);
        push({
          tone: 'error',
          title: error.problem.title || fallbackTitle,
          detail: error.problem.detail,
          ...(extras.length ? { extras } : {}),
        });
        return;
      }
      if (error instanceof SchemaError) {
        push({
          tone: 'error',
          title: 'Unexpected response',
          detail: 'The server returned a shape this console does not recognise.',
        });
        return;
      }
      push({
        tone: 'error',
        title: fallbackTitle,
        detail: error instanceof Error ? error.message : undefined,
      });
    },
    [push],
  );

  const value = useMemo(() => ({ push, pushError, dismiss }), [push, pushError, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-[min(420px,calc(100vw-3rem))] flex-col gap-3"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              'pointer-events-auto border bg-surface px-4 py-3',
              toast.tone === 'error' && 'border-carmine',
              toast.tone === 'success' && 'border-sage',
              toast.tone === 'info' && 'border-rule',
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <p
                className={cx(
                  'mono-label',
                  toast.tone === 'error' && 'text-carmine',
                  toast.tone === 'success' && 'text-sage',
                  toast.tone === 'info' && 'text-ink-2',
                )}
              >
                {toast.title}
              </p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="mono-label text-ink-3 hover:text-ink"
                aria-label="Dismiss"
              >
                Close
              </button>
            </div>
            {toast.detail ? <p className="mt-2 text-[14px] text-ink-2">{toast.detail}</p> : null}
            {toast.extras?.length ? (
              <ul className="mt-2 space-y-1">
                {toast.extras.map((extra) => (
                  <li key={extra} className="font-mono text-[11px] uppercase tracking-tag text-ink-3">
                    {extra}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToasts must be used inside ToastProvider.');
  return context;
}
