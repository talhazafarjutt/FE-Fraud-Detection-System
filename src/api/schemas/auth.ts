import { z } from 'zod';

export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string(),
  token_type: z.string().default('bearer'),
  expires_in: z.number().int().positive(),
  scopes: z.array(z.string()),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

/** Every scope the backend can issue. Drives the whole UI. */
export const SCOPES = [
  'transactions:write',
  'transactions:read',
  'scores:write',
  'alerts:read',
  'alerts:read:all',
  'alerts:update',
  'alerts:assign',
  'alerts:close',
  'users:manage',
] as const;

export type Scope = (typeof SCOPES)[number];

export const loginSchema = z.object({
  username: z.string().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const clientCredentialsSchema = z.object({
  client_id: z.string().min(3).max(64),
  client_secret: z.string().min(20).max(256),
});
export type ClientCredentialsInput = z.infer<typeof clientCredentialsSchema>;
