import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { healthRoutes } from './health.routes.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler, sendError } from './middleware/errors.js';
import { apiNotFound } from './middleware/api-not-found.js';
import { mountFrontend } from './middleware/frontend.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import type { AuthHttpOptions } from './modules/auth/auth.routes.js';
import type { AuthService } from './modules/auth/auth.service.js';

export interface AppDependencies {
  checkReady: () => Promise<void>;
  logger: Logger;
  trustProxy?: boolean;
  clientDirectory?: string;
  auth?: { service: AuthService; options: AuthHttpOptions };
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', dependencies.trustProxy ?? false);
  app.use(requestId);
  app.use(
    pinoHttp({
      logger: dependencies.logger,
      genReqId: (_req, res) => res.getHeader('X-Request-Id') as string,
      // No paths, query strings, headers, bodies or exception messages in HTTP logs.
      serializers: {
        req: (req: { id: string; method: string }) => ({
          id: req.id,
          method: req.method,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        err: () => ({ type: 'RequestError' }),
      },
    }),
  );
  app.use(helmet({ referrerPolicy: { policy: 'no-referrer' } }));

  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(express.json({ limit: '64kb' }));
  api.use('/v1/health', healthRoutes(dependencies.checkReady));
  if (dependencies.auth)
    api.use(
      '/v1/auth',
      authRoutes(dependencies.auth.service, dependencies.auth.options),
    );
  api.use(apiNotFound);
  app.use('/api', api);

  if (dependencies.clientDirectory)
    mountFrontend(app, dependencies.clientDirectory);
  app.use((_req, res) => {
    sendError(res, 404, 'NOT_FOUND', 'Resource not found.');
  });
  app.use(errorHandler);
  return app;
}
