import { z } from 'zod';
import { responseMetaSchema } from './http.js';
import { themeIdSchema } from './themes.js';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());
export const passwordSchema = z
  .string()
  .min(15, 'Use at least 15 characters.')
  .max(128, 'Use at most 128 characters.');
export const calendarDateSchema = z.iso.date();
export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Enter a valid timezone, such as Asia/Kolkata.');
const nameSchema = z.string().trim().min(1, 'This field is required.').max(100);

export const registerSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  displayName: nameSchema,
  wedding: z.strictObject({
    couple: z.strictObject({
      partner1Name: nameSchema,
      partner2Name: nameSchema,
    }),
    mainDate: calendarDateSchema,
    timezone: timezoneSchema,
    themeId: themeIdSchema,
  }),
});
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(128),
});
export const authDataSchema = z.object({
  user: z.object({
    id: z.string(),
    displayName: z.string(),
    email: z.email(),
    role: z.enum(['admin', 'manager']),
  }),
  wedding: z.object({
    id: z.string(),
    couple: z.object({ partner1Name: z.string(), partner2Name: z.string() }),
    mainDate: calendarDateSchema,
    timezone: timezoneSchema,
    slug: z.string(),
    publicationStatus: z.enum(['draft', 'published']),
    themeId: themeIdSchema,
  }),
});
export const authResponseSchema = z.object({
  data: authDataSchema,
  meta: responseMetaSchema,
});
export const csrfResponseSchema = z.object({
  data: z.object({ csrfToken: z.string().min(1) }),
  meta: responseMetaSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AuthData = z.infer<typeof authDataSchema>;
