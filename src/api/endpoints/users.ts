import { queryString, requestData } from '../client';
import { type CreateUserInput, type User, userListSchema, userSchema } from '../schemas/users';

export async function listUsers(team?: string, signal?: AbortSignal): Promise<User[]> {
  return requestData(`/v1/users${queryString({ team })}`, {
    schema: userListSchema,
    ...(signal ? { signal } : {}),
  });
}

export async function createUser(input: CreateUserInput): Promise<User> {
  return requestData('/v1/users', {
    method: 'POST',
    body: {
      email: input.email,
      full_name: input.full_name || null,
      password: input.password,
      team: input.team,
      roles: input.roles,
    },
    schema: userSchema,
  });
}

export async function deactivateUser(userId: string): Promise<User> {
  return requestData(`/v1/users/${userId}/deactivate`, {
    method: 'POST',
    schema: userSchema,
  });
}
