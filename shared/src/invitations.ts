import { z } from 'zod';
import { guestSchema } from './website.js';
import { responseMetaSchema } from './http.js';
export const invitationIdSchema = z.string().regex(/^[a-f0-9]{24}$/);
const required = z.string().trim().min(1, 'This field is required.').max(120);
export const invitationInputSchema = z.strictObject({
  familyDisplayName: required,
  contactName: required,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.union([z.literal(''), z.email().max(254)]))
    .optional(),
  phone: z
    .string()
    .trim()
    .max(25)
    .refine(
      (v) => !v || /^\+?[0-9 ()-]{7,25}$/.test(v),
      'Enter a valid phone number.',
    )
    .default(''),
  eventIds: z
    .array(invitationIdSchema)
    .min(1, 'Choose at least one ceremony.')
    .max(100)
    .refine((v) => new Set(v).size === v.length, 'Choose each ceremony once.'),
});
export const invitationPatchSchema = z
  .strictObject({
    ...invitationInputSchema.shape,
    phone: invitationInputSchema.shape.phone.unwrap(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Enter a change to save.');
export const sentStatusSchema = z.strictObject({
  sentStatus: z.enum(['sent', 'not_sent']),
});
export const invitationTokenSchema = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export const invitationSchema = invitationInputSchema.extend({
  id: invitationIdSchema,
  emailQueued: z.boolean().optional(),
  revision: z.number().int().positive(),
  sentStatus: z.enum(['sent', 'not_sent']),
  sentAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedEventIds: z.array(invitationIdSchema),
});
export const invitationResponseSchema = z.object({
  data: invitationSchema,
  meta: responseMetaSchema,
});
export const invitationListResponseSchema = z.object({
  data: z.array(invitationSchema),
  meta: responseMetaSchema.extend({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});
export const shareSchema = z.object({
  url: z.url(),
  message: z.string(),
  whatsappUrl: z.url(),
});
export const invitationRotationResponseSchema = z.object({
  data: invitationSchema.extend({ share: shareSchema.nullable() }),
  meta: responseMetaSchema,
});
export const shareResponseSchema = z.object({
  data: shareSchema,
  meta: responseMetaSchema,
});
export const estimateSchema = z.object({
  kind: z.literal('estimate'),
  totalFamilies: z.number().int(),
  sentFamilies: z.number().int(),
  attendees: z.object({ min: z.number().int(), max: z.number().int() }),
  events: z.array(
    z.object({
      eventId: invitationIdSchema,
      name: z.string(),
      sentFamilies: z.number().int(),
      min: z.number().int(),
      max: z.number().int(),
    }),
  ),
});
export const estimateResponseSchema = z.object({
  data: estimateSchema,
  meta: responseMetaSchema,
});
export const personalInvitationSchema = z.object({
  familyDisplayName: z.string(),
  selectedEventIds: z.array(invitationIdSchema),
  model: guestSchema,
});
export const personalInvitationResponseSchema = z.object({
  data: personalInvitationSchema,
  meta: responseMetaSchema,
});
export type InvitationInput = z.infer<typeof invitationInputSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationShare = z.infer<typeof shareSchema>;
export type PersonalInvitation = z.infer<typeof personalInvitationSchema>;
