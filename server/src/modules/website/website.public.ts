import { Router } from 'express';
import type { WebsiteService } from './website.service.js';
export function websitePublicRoutes(service: WebsiteService) {
  const router = Router();
  router.get('/weddings/:slug', async (req, res) =>
    res.json({
      data: await service.public(String(req.params.slug)),
      meta: { requestId: res.locals.requestId },
    }),
  );
  router.get('/weddings/:slug/events', async (req, res) =>
    res.json({
      data: (await service.public(String(req.params.slug))).events,
      meta: { requestId: res.locals.requestId },
    }),
  );
  router.get('/weddings/:slug/today', async (req, res) =>
    res.json({
      data: (await service.public(String(req.params.slug))).today,
      meta: { requestId: res.locals.requestId },
    }),
  );
  return router;
}
