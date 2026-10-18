import { z } from 'zod';

const forbiddenDatabases = new Set([
  'admin',
  'config',
  'local',
  'sample_mflix',
]);
const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(604800)
      .default(86400),
    CSRF_SECRET: z.string().min(32).max(512).optional(),
    APP_ORIGIN: z.url().refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
    }, 'Use an HTTP(S) origin without a path or trailing slash.'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    TRUST_PROXY: z
      .enum(['false', 'true'])
      .default('false')
      .transform((value) => value === 'true'),
    MONGODB_URI: z
      .string()
      .min(1)
      .refine(
        (value) => /^mongodb(?:\+srv)?:\/\//.test(value) && !/[<>]/.test(value),
        'Supply a MongoDB URI with real credentials.',
      ),
    MONGODB_DB_NAME: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .refine(
        (value) => !forbiddenDatabases.has(value),
        'Use a dedicated application database.',
      ),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && !value.CSRF_SECRET)
      context.addIssue({
        code: 'custom',
        path: ['CSRF_SECRET'],
        message: 'Production requires a stable CSRF secret.',
      });
    if (
      value.NODE_ENV === 'production' &&
      !value.APP_ORIGIN.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['APP_ORIGIN'],
        message: 'Production requires HTTPS.',
      });
    }
  });

export type Environment = z.infer<typeof envSchema>;

export function parseEnvironment(
  input: Record<string, string | undefined>,
): Environment {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    // Report only field names: validation diagnostics must not print credentials.
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(
      `Invalid server configuration: ${fields.join(', ')}. See server/.env.example.`,
    );
  }
  return result.data;
}
