import { Router } from 'express';
import type { HealthResponse } from '@wedding-suite/shared/http';
import { sendError } from './middleware/errors.js';

export function healthRoutes(checkReady: () => Promise<void>) {
  const router = Router();
  router.get('/live', (_req, res) => {
    const body: HealthResponse = {
      data: { status: 'ok' },
      meta: { requestId: res.locals.requestId as string },
    };
    res.json(body);
  });
  router.get('/ready', async (_req, res) => {
    try {
      await checkReady();
      const body: HealthResponse = {
        data: { status: 'ready' },
        meta: { requestId: res.locals.requestId as string },
      };
      res.json(body);
    } catch {
      sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Service is not ready.');
    }
  });
  return router;
}
