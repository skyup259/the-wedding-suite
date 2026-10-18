import { join } from 'node:path';
import { tmpdir } from 'node:os';
export function e2eOutbox(name: string) {
  if (!/^ws_test_auth_[a-f0-9]{24}$/.test(name))
    throw new Error('Refusing unsafe outbox path.');
  return join(tmpdir(), `${name}-outbox`);
}
