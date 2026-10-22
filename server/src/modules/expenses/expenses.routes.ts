import type { Router, Request, Response } from 'express';
import type { AuthSnapshot } from '../auth/auth.types.js';
import type { ExpenseService } from './expenses.service.js';
import { HttpError } from '../../middleware/errors.js';
export function mountExpenseRoutes(
  router: Router,
  service: ExpenseService,
  authorize: (req: Request) => Promise<AuthSnapshot>,
) {
  const revision = (req: Request) => {
    const m = /^"([1-9][0-9]*)"$/.exec(req.get('If-Match') ?? '');
    if (!m || !Number.isSafeInteger(Number(m[1])))
      throw new HttpError(
        428,
        'PRECONDITION_REQUIRED',
        'Reload the latest expense before saving.',
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
  router.get('/expenses', async (req, res) => {
    const p = await service.list(await authorize(req), req.query);
    res.json({
      data: p.items,
      meta: {
        requestId: res.locals.requestId,
        nextCursor: p.nextCursor,
        hasMore: p.hasMore,
      },
    });
  });
  router.get('/expenses/summary', async (req, res) =>
    send(res, await service.summary(await authorize(req), req.query)),
  );
  router.get('/expense-payments', async (req, res) => {
    const p = await service.payments(await authorize(req), req.query);
    res.json({
      data: p.items,
      meta: {
        requestId: res.locals.requestId,
        nextCursor: p.nextCursor,
        hasMore: p.hasMore,
        totalPaidPaise: p.totalPaidPaise,
      },
    });
  });
  router.get('/expenses/:id', async (req, res) =>
    send(res, await service.get(await authorize(req), String(req.params.id))),
  );
  router.post('/expenses', async (req, res) =>
    send(
      res,
      await service.create(
        await authorize(req),
        req.body,
        String(res.locals.requestId),
      ),
      201,
    ),
  );
  router.patch('/expenses/:id', async (req, res) =>
    send(
      res,
      await service.change(
        await authorize(req),
        String(req.params.id),
        revision(req),
        req.body,
        String(res.locals.requestId),
      ),
    ),
  );
  router.delete('/expenses/:id', async (req, res) => {
    await service.archive(
      await authorize(req),
      String(req.params.id),
      revision(req),
      String(res.locals.requestId),
    );
    res.status(204).end();
  });
  router.post('/expenses/:id/payments', async (req, res) =>
    send(
      res,
      await service.payment(
        await authorize(req),
        String(req.params.id),
        revision(req),
        req.body,
        req.get('Idempotency-Key') ?? '',
        String(res.locals.requestId),
      ),
      201,
    ),
  );
  router.patch('/expenses/:id/payments/:paymentId', async (req, res) =>
    send(
      res,
      await service.editPayment(
        await authorize(req),
        String(req.params.id),
        String(req.params.paymentId),
        revision(req),
        req.body,
        String(res.locals.requestId),
      ),
    ),
  );
  router.delete('/expenses/:id/payments/:paymentId', async (req, res) => {
    await service.editPayment(
      await authorize(req),
      String(req.params.id),
      String(req.params.paymentId),
      revision(req),
      null,
      String(res.locals.requestId),
    );
    res.status(204).end();
  });
}
