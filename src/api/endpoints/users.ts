import { requestData, route } from '../client';
import { type CreateUserInput, type User, userListSchema, userSchema } from '../schemas/users';

export async function listUsers(team?: string, signal?: AbortSignal): Promise<User[]> {
  return requestData(route('/v1/users', { team }), {
    schema: userListSchema,
    ...(signal ? { signal } : {}),
  });
}

export async function createUser(input: CreateUserInput): Promise<User> {
  return requestData(route('/v1/users'), {
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
  return requestData(route('/v1/users/{user_id}/deactivate', { user_id: userId }), {
    method: 'POST',
    schema: userSchema,
  });
}
