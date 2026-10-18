import { z } from 'zod';
import { calendarDateSchema, timezoneSchema } from './auth.js';
import { themeIdSchema } from './themes.js';
import { responseMetaSchema } from './http.js';
export const accentColors = [
  '#435438',
  '#8a4f38',
  '#552f64',
  '#263d52',
] as const;
const text = (max: number) => z.string().trim().max(max);
const name = z.string().trim().min(1, 'This field is required.').max(100);
export const mapUrlSchema = z.union([
  z.literal(''),
  z
    .url()
    .max(1000)
    .refine((v) => {
      const u = new URL(v);
      return u.protocol === 'https:' && !u.username && !u.password;
    }, 'Use an HTTPS map link without credentials.'),
]);
export const contactSchema = z.strictObject({
  name,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,25}$/, 'Enter a valid contact phone number.'),
});
export const websiteSettingsSchema = z.strictObject({
  themeId: themeIdSchema,
  intro: text(1000),
  welcomeMessage: text(2000),
  accentColor: z.enum(accentColors),
  coverPhotoId: z.null(),
});
export const weddingEditSchema = z.strictObject({
  couple: z.strictObject({ partner1Name: name, partner2Name: name }),
  mainDate: calendarDateSchema,
  timezone: timezoneSchema,
  website: websiteSettingsSchema,
  location: z
    .strictObject({
      city: text(100),
      area: text(200),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
    })
    .nullable(),
});
export const weddingPatchSchema = weddingEditSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Enter a change to save.');
export const announcementSchema = z.strictObject({
  message: z.string().trim().min(1).max(1000),
});
export const eventStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'completed',
]);
export const eventInputSchema = z
  .strictObject({
    name,
    description: text(2000),
    startAt: z.iso.datetime(),
    endAt: z.iso.datetime().nullable(),
    venue: z.strictObject({
      name: text(150),
      address: text(500),
      mapUrl: mapUrlSchema,
    }),
    contacts: z.array(contactSchema).max(2),
    dressCode: text(200),
    instructions: text(1000),
    status: eventStatusSchema,
    sortOrder: z.number().int().min(0).max(100000),
    stream: z.null(),
  })
  .refine((v) => !v.endAt || Date.parse(v.endAt) > Date.parse(v.startAt), {
    path: ['endAt'],
    message: 'End time must be after the start time.',
  });
export const eventPatchSchema = z
  .strictObject(eventInputSchema.shape)
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const eventSchema = eventInputSchema.safeExtend({
  id: z.string(),
  revision: z.number().int(),
  archivedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export const weddingSchema = weddingEditSchema.extend({
  id: z.string(),
  slug: z.string(),
  publicationStatus: z.enum(['draft', 'published']),
  revision: z.number().int(),
  photoExpiryAt: z.string(),
  updatedAt: z.string(),
  latestAnnouncement: z
    .object({ message: z.string(), updatedAt: z.string() })
    .nullable(),
});
export const publicWeddingSchema = z.object({
  couple: weddingEditSchema.shape.couple,
  mainDate: calendarDateSchema,
  timezone: timezoneSchema,
  slug: z.string(),
  website: websiteSettingsSchema,
  latestAnnouncement: z
    .object({ message: z.string(), updatedAt: z.string() })
    .nullable(),
});
export const publicEventSchema = z.object(eventSchema.shape).omit({
  revision: true,
  archivedAt: true,
});
export const todaySchema = z.object({
  active: z.array(z.string()),
  next: z.string().nullable(),
  overdue: z.array(z.string()),
  localDate: calendarDateSchema,
});
export const guestSchema = z.object({
  wedding: publicWeddingSchema,
  events: z.array(publicEventSchema),
  today: todaySchema,
  updatedAt: z.string(),
});
export const weddingResponseSchema = z.object({
  data: weddingSchema,
  meta: responseMetaSchema,
});
export const eventResponseSchema = z.object({
  data: eventSchema,
  meta: responseMetaSchema,
});
export const eventsResponseSchema = z.object({
  data: z.array(eventSchema),
  meta: responseMetaSchema,
});
export const guestResponseSchema = z.object({
  data: guestSchema,
  meta: responseMetaSchema,
});
export const themes = [
  {
    id: 'traditional',
    label: 'Traditional',
    description: 'Warm terracotta, framed stationery and ceremonial details.',
  },
  {
    id: 'floral',
    label: 'Floral',
    description: 'Soft olive, botanical shapes and a garden palette.',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Clean lines, generous space and quiet typography.',
  },
] as const;
export type WeddingEdit = z.infer<typeof weddingEditSchema>;
export type Wedding = z.infer<typeof weddingSchema>;
export type EventInput = z.infer<typeof eventInputSchema>;
export type WeddingEvent = z.infer<typeof eventSchema>;
export type GuestModel = z.infer<typeof guestSchema>;

export const previewResponseSchema = z.object({
  data: guestSchema,
  meta: responseMetaSchema.extend({ weddingRevision: z.number().int() }),
});
