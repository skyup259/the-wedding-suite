import type { Request, Response, Router } from 'express';
import { z } from 'zod';
import { Webhook } from 'svix';
import { emailPreviewInputSchema } from '@wedding-suite/shared/campaigns';
import type { AuthSnapshot } from '../auth/auth.types.js';
import { objectId } from '../access/access.service.js';
import { HttpError } from '../../middleware/errors.js';
import { applyReceipt } from './campaigns.service.js';
import type { CampaignService } from './campaigns.service.js';
export function mountCampaignRoutes(
  router: Router,
  service: CampaignService,
  authorize: (req: Request) => Promise<AuthSnapshot>,
) {
  const expected = (req: Request) => {
    const m = /^"([1-9][0-9]*)"$/.exec(req.get('If-Match') ?? '');
    if (!m || !Number.isSafeInteger(Number(m[1])))
      throw new HttpError(
        428,
        'PRECONDITION_REQUIRED',
        'Reload the current email batch or dispatch before continuing.',
      );
    return Number(m[1]);
  };
  const send = (res: Response, data: { revision: number }, status = 200) => {
    res.setHeader('ETag', `"${data.revision}"`);
    res
      .status(status)
      .json({ data, meta: { requestId: res.locals.requestId } });
  };
  router.post('/email-batches/preview', async (req, res) => {
    const actor = await authorize(req),
      input = emailPreviewInputSchema.parse(req.body);
    send(
      res,
      await service.preview(
        actor,
        input.invitationIds.map(objectId),
        String(res.locals.requestId),
      ),
      201,
    );
  });
  router.get('/email-batches', async (req, res) => {
    const query = z
        .strictObject({ cursor: z.string().max(100).optional() })
        .parse(req.query),
      actor = await authorize(req);
    let after;
    if (query.cursor) {
      try {
        const raw = JSON.parse(
          Buffer.from(query.cursor, 'base64url').toString('utf8'),
        ) as { weddingId: string; id: string };
        if (raw.weddingId !== String(actor.user.weddingId)) throw new Error();
        after = objectId(raw.id);
      } catch {
        throw new HttpError(
          400,
          'BAD_REQUEST',
          'Reload email batches from the first page.',
        );
      }
    }
    const page = await service.list(actor, after);
    res.json({
      data: page.items,
      meta: {
        requestId: res.locals.requestId,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor
          ? Buffer.from(
              JSON.stringify({
                weddingId: String(actor.user.weddingId),
                id: page.nextCursor,
              }),
            ).toString('base64url')
          : null,
      },
    });
  });
  router.get('/email-batches/:id', async (req, res) =>
    send(
      res,
      await service.get(await authorize(req), objectId(String(req.params.id))),
    ),
  );
  router.post('/email-batches/:id/confirm', async (req, res) => {
    const actor = await authorize(req);
    z.strictObject({}).parse(req.body ?? {});
    send(
      res,
      await service.confirm(
        actor,
        objectId(String(req.params.id)),
        expected(req),
        String(res.locals.requestId),
      ),
      202,
    );
  });
  router.post('/email-dispatches/:id/retry', async (req, res) => {
    const actor = await authorize(req);
    z.strictObject({}).parse(req.body ?? {});
    send(
      res,
      await service.retry(
        actor,
        objectId(String(req.params.id)),
        expected(req),
        String(res.locals.requestId),
      ),
      202,
    );
  });
  router.post('/email-dispatches/:id/reconcile', async (req, res) => {
    const actor = await authorize(req),
      input = z.strictObject({ providerId: z.uuid() }).parse(req.body);
    send(
      res,
      await service.reconcile(
        actor,
        objectId(String(req.params.id)),
        expected(req),
        input.providerId,
        String(res.locals.requestId),
      ),
    );
  });
}
const eventSchema = z.object({
  type: z.string(),
  created_at: z.string(),
  data: z.object({ email_id: z.uuid() }),
});
export function campaignWebhook(
  service: CampaignService,
  secret: string | undefined,
) {
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!secret)
      throw new HttpError(
        503,
        'WEBHOOK_UNAVAILABLE',
        'Email delivery verification is not configured.',
      );
    if (!Buffer.isBuffer(req.body))
      throw new HttpError(
        400,
        'INVALID_WEBHOOK',
        'Invalid email delivery event.',
      );
    let verified: unknown;
    try {
      new Webhook(secret).verify(req.body.toString('utf8'), {
        'svix-id': req.get('svix-id') ?? '',
        'svix-timestamp': req.get('svix-timestamp') ?? '',
        'svix-signature': req.get('svix-signature') ?? '',
      });
      verified = JSON.parse(req.body.toString('utf8'));
    } catch {
      throw new HttpError(
        401,
        'INVALID_WEBHOOK',
        'Email delivery signature could not be verified.',
      );
    }
    const base = z.object({ type: z.string() }).safeParse(verified);
    if (!base.success)
      throw new HttpError(
        400,
        'INVALID_WEBHOOK',
        'Invalid email delivery event.',
      );
    if (
      ![
        'email.sent',
        'email.delivery_delayed',
        'email.delivered',
        'email.failed',
        'email.bounced',
        'email.complained',
      ].includes(base.data.type)
    ) {
      res.status(204).end();
      return;
    }
    const parsed = eventSchema.safeParse(verified),
      id = req.get('svix-id') ?? '';
    if (
      !parsed.success ||
      id.length > 200 ||
      !Number.isFinite(Date.parse(parsed.data.created_at))
    )
      throw new HttpError(
        400,
        'INVALID_WEBHOOK',
        'Invalid email delivery event.',
      );
    await service.ready();
    const receipt = {
      _id: id,
      providerId: parsed.data.data.email_id,
      type: parsed.data.type,
      occurredAt: new Date(parsed.data.created_at),
      receivedAt: new Date(),
    };
    await service.store.webhook(receipt, (job) => applyReceipt(job, receipt));
    res.status(204).end();
  };
}
