import { z } from 'zod';
import { uuid } from './common';

export const userSchema = z.object({
  id: uuid,
  email: z.string(),
  full_name: z.string().nullable(),
  team: z.string(),
  is_active: z.boolean(),
  scopes: z.array(z.string()),
});
export type User = z.infer<typeof userSchema>;

export const userListSchema = z.array(userSchema);

export const ROLE_NAMES = ['ANALYST', 'SUPERVISOR', 'ADMIN'] as const;

/**
 * Password rules mirror the server's strength check. The meter in the UI reads
 * from these same predicates so it can never claim a password is fine when the
 * server will reject it.
 */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 12 characters', test: (v: string) => v.length >= 12 },
  { id: 'lower', label: 'A lowercase letter', test: (v: string) => /[a-z]/.test(v) },
  { id: 'upper', label: 'An uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { id: 'digit', label: 'A digit', test: (v: string) => /\d/.test(v) },
  { id: 'symbol', label: 'A symbol', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

export function passwordScore(value: string): number {
  return PASSWORD_RULES.filter((rule) => rule.test(value)).length;
}

export const createUserSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
  full_name: z.string().trim().max(255).optional().or(z.literal('')),
  password: z
    .string()
    .min(12, 'Use at least 12 characters.')
    .max(256)
    .refine(
      (v) => passwordScore(v) === PASSWORD_RULES.length,
      'Include lowercase, uppercase, a digit and a symbol.',
    ),
  team: z
    .string()
    .trim()
    .min(1, 'Team is required.')
    .max(64)
    .regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, digits, hyphen or underscore.'),
  roles: z.array(z.string()).min(1, 'Pick at least one role.').max(10),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;
