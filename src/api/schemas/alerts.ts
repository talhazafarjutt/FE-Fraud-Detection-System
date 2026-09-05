import { z } from 'zod';
import { feedbackSchema } from './feedback';
import {
  alertStatusSchema,
  decimalString,
  isoDateTime,
  looseAlertSeverity,
  looseAlertStatus,
  looseExplanationSchema,
  uuid,
} from './common';

export const alertSchema = z.object({
  id: uuid,
  transaction_id: uuid,
  status: looseAlertStatus,
  severity: looseAlertSeverity,
  fraud_probability: z.number(),
  team: z.string(),
  assigned_to: uuid.nullable(),
  opened_at: isoDateTime,
  closed_at: isoDateTime.nullable(),
  amount: decimalString.nullable().default(null),
  currency: z.string().nullable().default(null),
});
export type Alert = z.infer<typeof alertSchema>;

export const alertEventSchema = z.object({
  id: uuid,
  from_status: z.string().nullable(),
  to_status: z.string(),
  note: z.string().nullable(),
  actor_user_id: uuid.nullable(),
  created_at: isoDateTime,
});
export type AlertEvent = z.infer<typeof alertEventSchema>;

export const alertDetailSchema = alertSchema.extend({
  events: z.array(alertEventSchema).default([]),
  explanation: looseExplanationSchema,
  model_name: z.string().nullable().default(null),
  model_version: z.string().nullable().default(null),
  model_decision: z.string().nullable().default(null),
});
export type AlertDetail = z.infer<typeof alertDetailSchema>;

export const alertPageSchema = z.object({
  items: z.array(alertSchema),
  next_cursor: z.string().nullable().default(null),
  page_size: z.number().int(),
});
export type AlertPage = z.infer<typeof alertPageSchema>;

export const alertPatchSchema = z.object({
  status: alertStatusSchema.optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  note: z.string().max(2000, 'Notes are limited to 2000 characters.').optional(),
  /** §16.2 — permitted only alongside a terminal status. */
  feedback: feedbackSchema.optional(),
});
export type AlertPatch = z.infer<typeof alertPatchSchema>;

export interface AlertFilters {
  status?: string;
  severity?: string;
  min_probability?: number;
  limit?: number;
}
