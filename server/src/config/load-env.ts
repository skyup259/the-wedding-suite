import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// The same relative location works from src/config and dist/config.
// Production receives configuration from the deployment environment.
export function loadDevelopmentEnvironment(): void {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test')
    return;
  const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
  if (existsSync(envPath)) loadEnvFile(envPath);
}
