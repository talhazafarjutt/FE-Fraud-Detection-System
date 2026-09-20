import { request, requestData, route, scheduleProactiveRefresh, unsafeRoute } from '../client';
import { tokenStore } from '@/auth/tokenStore';
import { healthSchema } from '../schemas/common';
import {
  type ClientCredentialsInput,
  type LoginInput,
  type TokenResponse,
  tokenResponseSchema,
} from '../schemas/auth';

export async function login(input: LoginInput): Promise<TokenResponse> {
  /**
   * Hand-written on purpose. The OpenAPI document declares this body as an
   * untyped object, so the generated types would accept ANY shape here — a
   * form-encoded body or a misnamed field would typecheck and then 422 at
   * runtime with "Input should be a valid dictionary". It is JSON, it is
   * {username, password}, and tests/v1-contract.test.ts pins both.
   */
  const token = await requestData(route('/v1/auth/token'), {
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
  return requestData(route('/v1/auth/client-token'), {
    method: 'POST',
    body: input,
    schema: tokenResponseSchema,
    anonymous: true,
  });
}

export async function logout(): Promise<void> {
  await request(route('/v1/auth/logout'), { method: 'POST' });
}

export async function readiness() {
  // Not under /v1 and not in the versioned surface; the one documented
  // escape from the generated path list.
  return requestData(unsafeRoute('/readyz'), { schema: healthSchema, anonymous: true });
}
