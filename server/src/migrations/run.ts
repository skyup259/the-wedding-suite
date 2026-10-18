import { loadDevelopmentEnvironment } from '../config/load-env.js';
import { parseEnvironment } from '../config/env.js';
import { connectDatabase } from '../infrastructure/database/mongo.js';
import { migrateAuth } from './001-auth-foundation.js';

loadDevelopmentEnvironment();
try {
  const config = parseEnvironment(process.env);
  const database = await connectDatabase(
    config.MONGODB_URI,
    config.MONGODB_DB_NAME,
  );
  try {
    await migrateAuth(database.db);
    console.log(
      'Authentication schema migration complete. No wedding records seeded.',
    );
  } finally {
    await database.close();
  }
} catch {
  console.error(
    'Migration failed. Check configuration, database permissions, existing data/index compatibility, and migration lock. No credentials are logged.',
  );
  process.exitCode = 1;
}
