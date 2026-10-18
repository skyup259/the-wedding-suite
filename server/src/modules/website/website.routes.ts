import type { Router, Request, Response } from 'express';
import type { AuthSnapshot } from '../auth/auth.types.js';
import {
  accentColors,
  weddingPatchSchema,
  eventInputSchema,
  eventPatchSchema,
  announcementSchema,
} from '@wedding-suite/shared/website';
import { HttpError } from '../../middleware/errors.js';
import { safeWedding, safeEvent } from './website.service.js';
import type { WebsiteService } from './website.service.js';
import { objectId } from '../access/access.service.js';
export function mountWebsiteRoutes(
  router: Router,
  service: WebsiteService,
  authorize: (req: Request) => Promise<AuthSnapshot>,
) {
  const expected = (req: Request) => {
    const m = /^"([1-9][0-9]*)"$/.exec(req.get('If-Match') ?? '');
    if (!m || !Number.isSafeInteger(Number(m[1])))
      throw new HttpError(
        428,
        'PRECONDITION_REQUIRED',
        'Reload the latest version before saving.',
      );
    return Number(m[1]);
  };
  const send = (res: Response, data: unknown, status = 200) => {
    if (data && typeof data === 'object' && 'revision' in data)
      res.setHeader('ETag', `"${String(data.revision)}"`);
    res.status(status).json({
      data,
      meta: {
        requestId: res.locals.requestId,
        ...(Array.isArray(data) ? { nextCursor: null, hasMore: false } : {}),
      },
    });
  };
  const rid = (res: Response) => String(res.locals.requestId);
  router.get('/themes', async (req, res) => {
    await authorize(req);
    await service.ready();
    send(
      res,
      service.themes.map((theme) => ({
        ...theme,
        allowedAccentColors: accentColors,
        previewPath: '/website/preview',
      })),
    );
  });
  router.get('/wedding', async (req, res) =>
    send(res, safeWedding((await service.read(await authorize(req))).wedding)),
  );
  router.patch('/wedding', async (req, res) =>
    send(
      res,
      await service.patch(
        await authorize(req),
        weddingPatchSchema.parse(req.body),
        expected(req),
        rid(res),
      ),
    ),
  );
  router.get('/wedding/preview', async (req, res) => {
    const s = await service.read(await authorize(req));
    res.json({
      data: service.guest(s),
      meta: {
        requestId: res.locals.requestId,
        weddingRevision: s.wedding.revision,
      },
    });
  });
  router.post('/wedding/publish', async (req, res) =>
    send(
      res,
      await service.publish(
        await authorize(req),
        expected(req),
        true,
        rid(res),
      ),
    ),
  );
  router.post('/wedding/unpublish', async (req, res) =>
    send(
      res,
      await service.publish(
        await authorize(req),
        expected(req),
        false,
        rid(res),
      ),
    ),
  );
  router.put('/wedding/announcement', async (req, res) =>
    send(
      res,
      await service.announcement(
        await authorize(req),
        announcementSchema.parse(req.body).message,
        expected(req),
        rid(res),
      ),
    ),
  );
  router.delete('/wedding/announcement', async (req, res) => {
    await service.announcement(
      await authorize(req),
      null,
      expected(req),
      rid(res),
    );
    res.status(204).end();
  });
  router.get('/events', async (req, res) => {
    const s = await service.read(await authorize(req));
    if (
      req.query.includeArchived !== undefined &&
      !['true', 'false'].includes(String(req.query.includeArchived))
    )
      throw new HttpError(
        422,
        'VALIDATION_ERROR',
        'Use true or false for includeArchived.',
      );
    send(
      res,
      s.events
        .filter((e) => req.query.includeArchived === 'true' || !e.archivedAt)
        .map(safeEvent),
    );
  });
  router.get('/events/:id', async (req, res) => {
    const oid = objectId(String(req.params.id)),
      s = await service.read(await authorize(req)),
      event = s.events.find((e) => e._id.equals(oid));
    if (!event) throw new HttpError(404, 'NOT_FOUND', 'Ceremony not found.');
    send(res, safeEvent(event));
  });
  router.post('/events', async (req, res) =>
    send(
      res,
      await service.event(
        await authorize(req),
        eventInputSchema.parse(req.body),
        undefined,
        undefined,
        rid(res),
      ),
      201,
    ),
  );
  router.patch('/events/:id', async (req, res) =>
    send(
      res,
      await service.event(
        await authorize(req),
        eventPatchSchema.parse(req.body),
        String(req.params.id),
        expected(req),
        rid(res),
      ),
    ),
  );
  router.delete('/events/:id', async (req, res) => {
    await service.archive(
      await authorize(req),
      String(req.params.id),
      expected(req),
      req.query.confirmReferenced === 'true',
      rid(res),
    );
    res.status(204).end();
  });
  router.get('/dashboard', async (req, res) => {
    const s = await service.read(await authorize(req));
    const guest = service.guest(s);
    send(res, {
      wedding: safeWedding(s.wedding),
      events: guest.events,
      today: guest.today,
    });
  });
}
