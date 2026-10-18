import { z } from 'zod';

export const themeIdSchema = z.enum(['traditional', 'floral', 'minimal']);
export type ThemeId = z.infer<typeof themeIdSchema>;
