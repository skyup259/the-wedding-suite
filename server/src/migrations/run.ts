import { migrateCampaigns } from './005-invitation-email.js';
import { migrateInvitations } from './004-family-invitations.js';
import { loadDevelopmentEnvironment } from '../config/load-env.js';
import { parseEnvironment } from '../config/env.js';
import { connectDatabase } from '../infrastructure/database/mongo.js';
import { migrateWebsite } from './003-wedding-events.js';
import { migrateAccess } from './002-team-recovery.js';
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
    await migrateAccess(database.db);
    await migrateWebsite(database.db);
    await migrateInvitations(database.db);
    await migrateCampaigns(database.db);
    console.log(
      'Authentication, team/recovery, website/events, family invitation and email batch schema migrations complete. No wedding records seeded.',
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
