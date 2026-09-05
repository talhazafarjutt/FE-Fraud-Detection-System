import { z } from 'zod';
import { looseExplanationSchema, uuid } from './common';

/** Machine push path. Only reachable from the env-gated Simulator screen. */
export const scorePushSchema = z.object({
  transaction_id: z.string().uuid('Must be a transaction UUID.'),
  fraud_probability: z.coerce.number().min(0).max(1),
  risk_level: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  decision: z.enum(['ALLOW', 'REVIEW', 'BLOCK']).optional(),
  model_name: z.string().min(1).max(64).default('fraud-model'),
  model_version: z.string().min(1).max(32),
  latency_ms: z.coerce.number().int().min(0).max(600_000).optional(),
});
export type ScorePushInput = z.infer<typeof scorePushSchema>;

export const scorePushResultSchema = z.object({
  transaction_id: uuid,
  fraud_probability: z.number(),
  risk_level: z.string().nullable().default(null),
  alert_id: uuid.nullable().default(null),
  explanation: looseExplanationSchema.optional(),
});
