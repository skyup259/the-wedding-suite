import { fileURLToPath } from 'node:url';
import { defineProject, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineProject({
    root: fileURLToPath(new URL('.', import.meta.url)),
    test: {
      name: 'client',
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      exclude: [
        '**/*.integration.test.{ts,tsx}',
        '**/dist/**',
        '**/node_modules/**',
      ],
      setupFiles: ['./src/test/setup.ts'],
    },
  }),
);
