import { z } from 'zod';
import { emailSchema, passwordSchema } from './auth.js';
import { responseMetaSchema } from './http.js';
export const linkTokenSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'This link is invalid. Request a new link.');
export const inviteSchema = z.strictObject({
  email: emailSchema,
  displayName: z.string().trim().min(1).max(100).optional(),
});
export const acceptManagerSchema = z.strictObject({
  token: linkTokenSchema,
  displayName: z.string().trim().min(1).max(100),
  password: passwordSchema,
});
export const resetRequestSchema = z.strictObject({ email: emailSchema });
export const resetConfirmSchema = z.strictObject({
  token: linkTokenSchema,
  newPassword: passwordSchema,
});
export const memberStatusSchema = z.strictObject({
  status: z.enum(['active', 'disabled']),
});
export const memberSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string().optional(),
  role: z.enum(['admin', 'manager']),
  status: z.enum(['active', 'disabled']),
  revision: z.number().int(),
});
export const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  status: z.enum(['pending', 'expired', 'used', 'revoked']),
  expiresAt: z.string(),
  revision: z.number().int(),
  delivery: z.enum([
    'queued',
    'running',
    'accepted',
    'outbox',
    'failed',
    'cancelled',
  ]),
});
export const membersResponseSchema = z.object({
  data: z.array(memberSchema),
  meta: responseMetaSchema.extend({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});
export const invitationsResponseSchema = z.object({
  data: z.array(invitationSchema),
  meta: responseMetaSchema.extend({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});
export type Member = z.infer<typeof memberSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
