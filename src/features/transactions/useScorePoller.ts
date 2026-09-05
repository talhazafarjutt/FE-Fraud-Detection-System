import { useCallback, useEffect, useRef, useState } from 'react';
import { getTransactionScore } from '@/api/endpoints/transactions';
import type { Risk } from '@/api/schemas/transactions';
import { errorStatus } from '@/lib/problem';

/**
 * A 202 means the transaction was stored but not yet scored — the model was
 * slow or down. That is graceful degradation, not an error, so the UI polls
 * GET /{id}/score, which 404s until a score exists.
 *
 * Backoff: 1s, 2s, 4s, 8s, then 8s, giving up at ~60s with a retry button.
 */
const DELAYS = [1_000, 2_000, 4_000, 8_000] as const;
const MAX_DELAY = 8_000;
const GIVE_UP_AFTER_MS = 60_000;

export type PollState =
  | { phase: 'idle' }
  | { phase: 'polling'; attempt: number; elapsedMs: number }
  | { phase: 'scored'; risk: Risk }
  | { phase: 'gave-up' }
  | { phase: 'failed'; message: string };

export function useScorePoller(transactionId: string | null, enabled: boolean) {
  const [state, setState] = useState<PollState>({ phase: 'idle' });
  const [nonce, setNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const retry = useCallback(() => {
    setState({ phase: 'idle' });
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !transactionId) {
      setState({ phase: 'idle' });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const controller = new AbortController();
    abortRef.current = controller;

    const attemptPoll = async (attempt: number) => {
      if (cancelled) return;
      const elapsedMs = Date.now() - startedAt;
      setState({ phase: 'polling', attempt: attempt + 1, elapsedMs });

      try {
        const risk = await getTransactionScore(transactionId, controller.signal);
        if (!cancelled) setState({ phase: 'scored', risk });
        return;
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        const status = errorStatus(error);
        // 404 is the documented "not scored yet" answer — keep waiting.
        if (status !== 404) {
          setState({
            phase: 'failed',
            message:
              status === 403
                ? 'This account cannot read transaction scores.'
                : 'The score endpoint returned an unexpected error.',
          });
          return;
        }
      }

      if (Date.now() - startedAt >= GIVE_UP_AFTER_MS) {
        if (!cancelled) setState({ phase: 'gave-up' });
        return;
      }

      const delay = DELAYS[attempt] ?? MAX_DELAY;
      timer = setTimeout(() => void attemptPoll(attempt + 1), delay);
    };

    void attemptPoll(0);

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [transactionId, enabled, nonce]);

  return { state, retry };
}
