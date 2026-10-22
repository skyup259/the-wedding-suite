import { campaignWebhook } from './modules/campaigns/campaigns.routes.js';
import type { CampaignService } from './modules/campaigns/campaigns.service.js';
import { invitationPublicRoutes } from './modules/invitations/invitations.routes.js';
import type { InvitationService } from './modules/invitations/invitations.service.js';
import { websitePublicRoutes } from './modules/website/website.public.js';
import type { WebsiteService } from './modules/website/website.service.js';
import type { AccessService } from './modules/access/access.service.js';
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
  access?: AccessService;
  website?: WebsiteService;
  invitations?: InvitationService;
  campaigns?: CampaignService;
  resendWebhookSecret?: string;
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

  if (dependencies.campaigns)
    app.post(
      '/api/v1/webhooks/resend',
      express.raw({ type: 'application/json', limit: '64kb' }),
      campaignWebhook(dependencies.campaigns, dependencies.resendWebhookSecret),
    );
  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(express.json({ limit: '64kb' }));
  api.use('/v1/health', healthRoutes(dependencies.checkReady));
  if (dependencies.invitations && dependencies.auth)
    api.use(
      '/v1/public',
      invitationPublicRoutes(
        dependencies.invitations,
        dependencies.auth.service,
      ),
    );
  if (dependencies.website)
    api.use('/v1/public', websitePublicRoutes(dependencies.website));
  if (dependencies.auth)
    api.use(
      '/v1',
      authRoutes(
        dependencies.auth.service,
        dependencies.auth.options,
        dependencies.access,
        dependencies.website,
        dependencies.invitations,
        dependencies.campaigns,
      ),
    );
  api.use(apiNotFound);
  app.use('/api', api);

  if (dependencies.clientDirectory)
    mountFrontend(
      app,
      dependencies.clientDirectory,
      dependencies.website,
      dependencies.auth?.options.origin,
    );
  app.use((_req, res) => {
    sendError(res, 404, 'NOT_FOUND', 'Resource not found.');
  });
  app.use(errorHandler);
  return app;
}
