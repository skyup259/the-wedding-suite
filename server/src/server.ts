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
      return createApp({
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
  });
  server.on('error', () => {
    logger.error('HTTP listener failed. Check the configured port.');
    void database.close().finally(() => {
      process.exitCode = 1;
    });
  });
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down');
    const timeout = setTimeout(() => {
      process.exit(1);
    }, 10000);
    timeout.unref();
    server.close(() => {
      void database
        .close()
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
