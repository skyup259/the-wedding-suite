import { z } from 'zod';
import { invitationIdSchema } from './invitations.js';
import { responseMetaSchema } from './http.js';
export const emailPreviewInputSchema = z.strictObject({
  invitationIds: z
    .array(invitationIdSchema)
    .min(1)
    .max(25)
    .refine((v) => new Set(v).size === v.length, 'Select each family once.'),
});
export const emailDispatchSchema = z.object({
  id: invitationIdSchema,
  invitationId: invitationIdSchema,
  batchId: invitationIdSchema,
  familyDisplayName: z.string(),
  kind: z.literal('first'),
  status: z.enum([
    'queued',
    'running',
    'accepted',
    'outbox',
    'failed',
    'cancelled',
    'unknown',
  ]),
  delivery: z.enum([
    'pending',
    'accepted',
    'delayed',
    'delivered',
    'bounced',
    'complained',
    'failed',
  ]),
  revision: z.number().int(),
  attempts: z.number().int(),
  errorCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  canRetry: z.boolean(),
});
export const emailBatchSchema = z.object({
  id: invitationIdSchema,
  revision: z.number().int(),
  status: z.enum(['preview', 'confirmed', 'cancelled']),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  mode: z.enum(['outbox', 'resend']),
  quota: z.object({
    day: z.string(),
    timezone: z.string(),
    firstRemaining: z.number().int(),
  }),
  items: z.array(
    z.object({
      invitationId: invitationIdSchema,
      kind: z.literal('first'),
      to: z.string().optional(),
      subject: z.string().optional(),
      text: z.string().optional(),
    }),
  ),
  dispatches: z.array(emailDispatchSchema),
});
export const emailBatchResponseSchema = z.object({
  data: emailBatchSchema,
  meta: responseMetaSchema,
});
export const emailDispatchResponseSchema = z.object({
  data: emailDispatchSchema,
  meta: responseMetaSchema,
});
export const emailBatchListSchema = z.object({
  data: z.array(emailBatchSchema),
  meta: responseMetaSchema.extend({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});
export type EmailBatch = z.infer<typeof emailBatchSchema>;
export type EmailDispatch = z.infer<typeof emailDispatchSchema>;
