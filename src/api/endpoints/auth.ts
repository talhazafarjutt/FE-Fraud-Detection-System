import { request, requestData, scheduleProactiveRefresh } from '../client';
import { tokenStore } from '@/auth/tokenStore';
import { healthSchema } from '../schemas/common';
import {
  type ClientCredentialsInput,
  type LoginInput,
  type TokenResponse,
  tokenResponseSchema,
} from '../schemas/auth';

export async function login(input: LoginInput): Promise<TokenResponse> {
  const token = await requestData('/v1/auth/token', {
    method: 'POST',
    body: { username: input.username, password: input.password },
    schema: tokenResponseSchema,
    anonymous: true,
  });
  // The token carries no email claim, so we keep what the user typed.
  tokenStore.set(token, input.username);
  scheduleProactiveRefresh();
  return token;
}

/** Machine-to-machine. Only ever called from the env-gated Simulator screen. */
export async function clientToken(input: ClientCredentialsInput): Promise<TokenResponse> {
  return requestData('/v1/auth/client-token', {
    method: 'POST',
    body: input,
    schema: tokenResponseSchema,
    anonymous: true,
  });
}

export async function logout(): Promise<void> {
  await request('/v1/auth/logout', { method: 'POST' });
}

export async function readiness() {
  return requestData('/readyz', { schema: healthSchema, anonymous: true });
}
