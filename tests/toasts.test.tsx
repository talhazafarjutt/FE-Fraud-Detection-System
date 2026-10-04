import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useToasts } from '@/components/Toasts';
import { ApiError } from '@/lib/problem';
import { renderWithProviders } from './render';
import { WIRE_ASSIGNEE_PROBLEM } from './wire';

function apiError(status: number, extras: Record<string, unknown>) {
  return new ApiError({ status, title: 'Problem', detail: 'It went wrong.', extras });
}

function Trigger({ error }: { error: unknown }) {
  const { pushError } = useToasts();
  return (
    <button type="button" onClick={() => pushError(error)}>
      Fail
    </button>
  );
}

async function toastFor(error: unknown) {
  renderWithProviders(<Trigger error={error} />);
  await userEvent.click(screen.getByRole('button', { name: 'Fail' }));
  return screen.getByRole('status');
}

describe('error toasts', () => {
  it('leave the request id off a 4xx the user can act on', async () => {
    const { errors, request_id } = WIRE_ASSIGNEE_PROBLEM;
    const toast = await toastFor(apiError(422, { errors, request_id }));
    expect(toast).toHaveTextContent('It went wrong.');
    expect(toast).not.toHaveTextContent(/request id/i);
    // Field errors are already in the detail, not dumped as objects.
    expect(toast).not.toHaveTextContent('[object Object]');
  });

  it('still list the legal moves on a 409', async () => {
    const toast = await toastFor(
      apiError(409, { allowed_transitions: ['IN_REVIEW', 'ESCALATED'], request_id: 'abc123' }),
    );
    expect(toast).toHaveTextContent('allowed transitions: IN_REVIEW, ESCALATED');
    expect(toast).not.toHaveTextContent(/request id/i);
  });

  it('keep the request id on a server fault, for support', async () => {
    const toast = await toastFor(apiError(500, { request_id: 'bd68c50765524fcc' }));
    expect(toast).toHaveTextContent('request id: bd68c50765524fcc');
  });
});
