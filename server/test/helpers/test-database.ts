import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';

export async function createTestDatabase(requestedName?: string) {
  if (requestedName && !/^ws_test_auth_[a-f0-9]{24}$/.test(requestedName))
    throw new Error('Refusing unsafe test database name.');
  if (process.env.NODE_ENV === 'production')
    throw new Error('Integration tests cannot run in production mode.');
  const envPath = new URL('../../.env', import.meta.url);
  const local = existsSync(envPath)
    ? parseEnv(readFileSync(envPath, 'utf8'))
    : {};
  const uri =
    process.env.TEST_MONGODB_URI ??
    process.env.MONGODB_URI ??
    local.MONGODB_URI;
  if (!uri)
    throw new Error(
      'Set TEST_MONGODB_URI or configure server/.env for isolated integration tests.',
    );
  const name =
    requestedName ??
    `ws_test_auth_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
  } catch {
    await client.close();
    throw new Error(
      'Test Atlas connection failed. Check current IP access, private credentials and database permissions.',
    );
  }
  const db = client.db(name);
  return {
    client,
    db,
    cleanup: async () => {
      try {
        if (
          db.databaseName !== name ||
          !/^ws_test_auth_[a-f0-9]{24}$/.test(name)
        )
          throw new Error('Refusing unsafe test cleanup.');
        await db.dropDatabase();
      } finally {
        await client.close();
      }
    },
  };
}
