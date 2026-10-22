import { ExpenseService } from './modules/expenses/expenses.service.js';
import { MongoExpenseStore } from './modules/expenses/expenses.repository.js';
import { CampaignService } from './modules/campaigns/campaigns.service.js';
import { MongoCampaignStore } from './modules/campaigns/campaigns.repository.js';
import { InvitationEmailWorker } from './jobs/invitation-email.js';
import { invitationVault } from './modules/invitations/invitations.vault.js';
import { InvitationService } from './modules/invitations/invitations.service.js';
import { MongoInvitationStore } from './modules/invitations/invitations.repository.js';
import { MongoWebsiteStore } from './modules/website/website.repository.js';
import { WebsiteService } from './modules/website/website.service.js';
import { emailRuntime } from './infrastructure/email.js';
import { MongoAccessStore } from './modules/access/access.repository.js';
import { AccessService } from './modules/access/access.service.js';
import { AuthEmailWorker } from './jobs/auth-email.js';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadDevelopmentEnvironment } from './config/load-env.js';
import { parseEnvironment } from './config/env.js';
import { connectDatabase } from './infrastructure/database/mongo.js';
import { createLogger } from './infrastructure/logger.js';
import { MongoAuthStore } from './modules/auth/auth.repository.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { developmentCsrfSecret } from './modules/auth/auth.routes.js';

async function start(): Promise<void> {
  loadDevelopmentEnvironment();
  const config = parseEnvironment(process.env);
  const logger = createLogger(config.LOG_LEVEL);
  const database = await connectDatabase(
    config.MONGODB_URI,
    config.MONGODB_DB_NAME,
  );
  let shuttingDown = false;
  let emailWorker: AuthEmailWorker | null = null;
  let invitationWorker: InvitationEmailWorker | null = null;
  const app = await Promise.resolve()
    .then(async () => {
      const authStore = new MongoAuthStore(database.client, database.db);
      const authService = await createAuthService(
        authStore,
        config.SESSION_TTL_SECONDS,
      );
      if (!(await authStore.ready()))
        logger.warn(
          'Authentication migrations pending. Run npm run db:migrate before using signup/login.',
        );
      const email = await emailRuntime(config);
      const accessStore = new MongoAccessStore(database.client, database.db);
      const access = email
        ? new AccessService(
            accessStore,
            authService,
            email.vault,
            config.APP_ORIGIN,
            config.MANAGER_INVITE_TTL_SECONDS,
            config.PASSWORD_RESET_TTL_SECONDS,
          )
        : undefined;
      if (email) {
        if (!(await accessStore.ready()))
          logger.warn(
            'Team/recovery migrations pending. Run npm run db:migrate before using invitations/recovery.',
          );
        emailWorker = new AuthEmailWorker(
          accessStore,
          email.vault,
          email.transport,
        );
      }
      const website = new WebsiteService(
        new MongoWebsiteStore(database.client, database.db),
      );
      const linkVault = await invitationVault(config);
      if (!linkVault)
        logger.warn(
          'Family invitations unavailable until INVITATION_ENCRYPTION_KEY is configured.',
        );
      const invitations = linkVault
        ? new InvitationService(
            new MongoInvitationStore(database.client, database.db),
            linkVault,
            website,
            config.APP_ORIGIN,
          )
        : undefined;
      const campaigns =
        email && invitations
          ? new CampaignService(
              new MongoCampaignStore(database.client, database.db),
              invitations,
              email.vault,
              email.mode,
              config.EMAIL_ALLOWED_RECIPIENTS.length
                ? config.EMAIL_ALLOWED_RECIPIENTS
                : null,
              email.transport,
            )
          : undefined;
      if (campaigns && email)
        invitationWorker = new InvitationEmailWorker(
          campaigns,
          email.vault,
          email.transport,
        );
      return createApp({
        expenses: new ExpenseService(
          new MongoExpenseStore(database.client, database.db),
        ),
        website,
        ...(invitations ? { invitations } : {}),
        ...(campaigns ? { campaigns } : {}),
        ...(config.RESEND_WEBHOOK_SECRET
          ? { resendWebhookSecret: config.RESEND_WEBHOOK_SECRET }
          : {}),
        ...(access ? { access } : {}),
        logger,
        trustProxy: config.TRUST_PROXY,
        auth: {
          service: authService,
          options: {
            origin: config.APP_ORIGIN,
            secure: config.NODE_ENV === 'production',
            csrfSecret: config.CSRF_SECRET ?? developmentCsrfSecret(),
          },
        },
        checkReady: async () => {
          if (shuttingDown) throw new Error('Shutting down');
          await database.checkReady();
        },
        ...(config.NODE_ENV === 'production'
          ? {
              clientDirectory: fileURLToPath(
                new URL('../../client/dist/', import.meta.url),
              ),
            }
          : {}),
      });
    })
    .catch(async (error: unknown) => {
      await database.close();
      throw error;
    });
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'Server started');
    emailWorker?.start();
    invitationWorker?.start();
  });
  server.on('error', () => {
    logger.error('HTTP listener failed. Check the configured port.');
    void (async () => {
      await Promise.all([emailWorker?.stop(), invitationWorker?.stop()]);
      await database.close();
    })().finally(() => {
      process.exitCode = 1;
    });
  });
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down');
    const timeout = setTimeout(() => {
      process.exit(1);
    }, 25000);
    timeout.unref();
    const emailStopped = Promise.all([
      emailWorker?.stop(),
      invitationWorker?.stop(),
    ]);
    server.close(() => {
      void (async () => {
        await emailStopped;
        await database.close();
      })()
        .then(() => {
          clearTimeout(timeout);
        })
        .catch(() => {
          process.exitCode = 1;
        });
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void start().catch((error: unknown) => {
  // Only explicitly sanitised configuration/database errors are surfaced.
  const message =
    error instanceof Error &&
    (error.message.startsWith('Invalid server configuration:') ||
      error.message.startsWith('Atlas connection failed.'))
      ? error.message
      : 'Server startup failed. Check configuration and build output.';
  console.error(message);
  process.exitCode = 1;
});
