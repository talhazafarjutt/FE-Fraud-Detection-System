import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { errorMessage } from '@/lib/problem';
import { Button } from './primitives';

interface Props {
  children: ReactNode;
  /** Shown in the card so the user knows which part of the console failed. */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * A crash shows a card with a retry button — never a white screen. There is one
 * of these per route plus a global one at the shell.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Deliberately console-only: no third-party error reporting, and nothing
    // that could carry a token into an outbound payload.
    if (import.meta.env.DEV) {
      console.error('[boundary]', error, info.componentStack);
    }
  }

  private readonly reset = () => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="border border-carmine bg-surface p-8">
        <p className="eyebrow text-carmine">
          {this.props.label ? `${this.props.label} — failed` : 'Something failed'}
        </p>
        <h2 className="mb-3">This panel could not be displayed.</h2>
        <p className="mb-6 max-w-xl text-ink-2">{errorMessage(error)}</p>
        <Button onClick={this.reset}>Try again</Button>
      </div>
    );
  }
}
