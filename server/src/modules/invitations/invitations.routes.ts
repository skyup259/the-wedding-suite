import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AuthSnapshot } from '../auth/auth.types.js';
import type { AuthService } from '../auth/auth.service.js';
import {
  invitationInputSchema,
  invitationPatchSchema,
  sentStatusSchema,
} from '@wedding-suite/shared/invitations';
import type { InvitationService } from './invitations.service.js';
import { HttpError } from '../../middleware/errors.js';
export function mountInvitationRoutes(
  router: Router,
  service: InvitationService,
  authorize: (req: Request) => Promise<AuthSnapshot>,
) {
  const expected = (req: Request) => {
    const m = /^"([1-9][0-9]*)"$/.exec(req.get('If-Match') ?? '');
    if (!m || !Number.isSafeInteger(Number(m[1])))
      throw new HttpError(
        428,
        'PRECONDITION_REQUIRED',
        'Reload the latest family version before saving.',
      );
    return Number(m[1]);
  };
  const send = (res: Response, data: unknown, status = 200) => {
    if (data && typeof data === 'object' && 'revision' in data)
      res.setHeader('ETag', `"${String(data.revision)}"`);
    res
      .status(status)
      .json({ data, meta: { requestId: res.locals.requestId } });
  };
  router.get('/invitations', async (req, res) => {
    const page = await service.list(await authorize(req), req.query);
    res.json({
      data: page.items,
      meta: {
        requestId: res.locals.requestId,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      },
    });
  });
  router.get('/attendance-estimates', async (req, res) =>
    send(res, await service.estimates(await authorize(req))),
  );
  router.post('/invitations', async (req, res) =>
    send(
      res,
      await service.create(
        await authorize(req),
        invitationInputSchema.parse(req.body),
        String(res.locals.requestId),
      ),
      201,
    ),
  );
  router.get('/invitations/:id', async (req, res) =>
    send(res, await service.get(await authorize(req), String(req.params.id))),
  );
  router.patch('/invitations/:id', async (req, res) =>
    send(
      res,
      await service.change(
        await authorize(req),
        String(req.params.id),
        expected(req),
        'edit',
        invitationPatchSchema.parse(req.body),
        String(res.locals.requestId),
      ),
    ),
  );
  router.post('/invitations/:id/sent-status', async (req, res) =>
    send(
      res,
      await service.change(
        await authorize(req),
        String(req.params.id),
        expected(req),
        'sent',
        sentStatusSchema.parse(req.body).sentStatus,
        String(res.locals.requestId),
      ),
    ),
  );
  router.post('/invitations/:id/share-link', async (req, res) =>
    send(res, await service.share(await authorize(req), String(req.params.id))),
  );
  router.post('/invitations/:id/rotate-link', async (req, res) => {
    const actor = await authorize(req),
      id = String(req.params.id);
    // Published rotation also returns a new share payload; drafts return share:null.
    send(
      res,
      await service.change(
        actor,
        id,
        expected(req),
        'rotate',
        undefined,
        String(res.locals.requestId),
      ),
    );
  });
  router.delete('/invitations/:id', async (req, res) => {
    await service.change(
      await authorize(req),
      String(req.params.id),
      expected(req),
      'archive',
      undefined,
      String(res.locals.requestId),
    );
    res.status(204).end();
  });
}
export function invitationPublicRoutes(
  service: InvitationService,
  auth: AuthService,
) {
  const router = Router();
  router.post('/weddings/:slug/invitation-view', async (req, res) => {
    const rate = await auth.limit(`invitation-view:${req.ip}`, 60);
    if (!rate.allowed) {
      res.setHeader('Retry-After', rate.retryAfter);
      throw new HttpError(
        429,
        'RATE_LIMITED',
        'Too many attempts. Please try again later.',
      );
    }
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    // Malformed, revoked, archived, unknown and wrong-wedding capabilities share one response.
    const body: unknown = req.body;
    if (
      !body ||
      typeof body !== 'object' ||
      Object.keys(body).length !== 1 ||
      !('token' in body) ||
      typeof body.token !== 'string'
    )
      throw new HttpError(404, 'NOT_FOUND', 'Invitation not available.');
    res.json({
      data: await service.publicView(String(req.params.slug), body.token),
      meta: { requestId: res.locals.requestId },
    });
  });
  return router;
}
