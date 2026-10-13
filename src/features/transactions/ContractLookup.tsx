import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getContract } from '@/api/endpoints/islamic';
import type { ContractDetail } from '@/api/schemas/contracts';
import { contractsKey, scheduleText, todayIso } from '@/features/contracts/parts';
import { errorStatus } from '@/lib/problem';
import { formatAmount } from '@/lib/money';

/** How long the contract number must sit still before the register is asked. */
export const LOOKUP_DEBOUNCE_MS = 400;

/** The id once it has sat still for `delayMs` — the first one too, so a first keystroke is not looked up. */
function useSettledId(value: string, delayMs: number): string {
  const [settled, setSettled] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

/** The first instalment due today or later, from the registered schedule. */
export function nextDue(contract: ContractDetail, today: string = todayIso()): string | null {
  return contract.schedule.find((item) => item.due_date >= today)?.due_date ?? null;
}

/** "Registered: ACTIVE · 48 × 4,350.00 · next due 2026-11-01". */
export function registeredText(contract: ContractDetail, today?: string): string {
  const parts = [`Registered: ${contract.status}`];
  const schedule = scheduleText(contract.tenor, contract.scheduled_amount, formatAmount);
  if (schedule) parts.push(schedule);
  const due = nextDue(contract, today);
  if (due) parts.push(`next due ${due}`);
  return parts.join(' · ');
}

export const NOT_REGISTERED_TEXT =
  'Not registered — checked against labels only; false-alarm removal needs a registered contract';

/**
 * Beside the contract number: whether the bank registered it. A registered
 * contract's terms replace the labels below when the rules run, and only a
 * registered ACTIVE one can have a false alarm set aside. The lookup reads
 * the register with the analyst's own session (alerts:read); a 403 or any
 * other failure says nothing rather than alarm someone filling in a form.
 */
export function ContractLookup({ contractId }: { contractId: string }) {
  const id = useSettledId(contractId.trim(), LOOKUP_DEBOUNCE_MS);
  const query = useQuery({
    queryKey: [...contractsKey, 'detail', id],
    queryFn: ({ signal }) => getContract(id, signal),
    enabled: id.length > 0 && id.length <= 64,
    retry: false,
    staleTime: 30_000,
  });

  if (!id || id !== contractId.trim()) return null;

  let text: string | null = null;
  let tone = 'text-ink-3';
  if (query.isPending) {
    text = 'Checking the contract register…';
  } else if (query.isError) {
    if (errorStatus(query.error) === 404) text = NOT_REGISTERED_TEXT;
  } else {
    text = registeredText(query.data);
    tone = query.data.status === 'ACTIVE' ? 'text-sage' : 'text-carmine';
  }
  if (!text) return null;

  return (
    <p className={`font-mono text-[12px] ${tone}`} role="status" aria-live="polite">
      {text}
    </p>
  );
}
