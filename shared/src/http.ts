import { z } from 'zod';

export const responseMetaSchema = z.object({ requestId: z.string().min(1) });

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    fields: z
      .array(
        z.object({ path: z.string(), code: z.string(), message: z.string() }),
      )
      .optional(),
  }),
  meta: responseMetaSchema,
});

export const healthResponseSchema = z.object({
  data: z.object({ status: z.enum(['ok', 'ready', 'unavailable']) }),
  meta: responseMetaSchema,
});

export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ApiResponse<T> = {
  data: T;
  meta: z.infer<typeof responseMetaSchema>;
};
