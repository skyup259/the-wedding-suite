import { mountInvitationRoutes } from '../invitations/invitations.routes.js';
import type { InvitationService } from '../invitations/invitations.service.js';
import { mountWebsiteRoutes } from '../website/website.routes.js';
import type { WebsiteService } from '../website/website.service.js';
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { CookieOptions, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { doubleCsrf } from 'csrf-csrf';
import { loginSchema, registerSchema } from '@wedding-suite/shared/auth';
import {
  inviteSchema,
  acceptManagerSchema,
  resetRequestSchema,
  resetConfirmSchema,
  memberStatusSchema,
} from '@wedding-suite/shared/access';
import { requireAdmin } from '../access/access.service.js';
import type { AccessService } from '../access/access.service.js';
import { ZodError } from 'zod';
import { HttpError } from '../../middleware/errors.js';
import { digest, opaqueToken, publicIdentity } from './auth.service.js';
import type { AuthService } from './auth.service.js';

export interface AuthHttpOptions {
  origin: string;
  secure: boolean;
  csrfSecret: string;
}
export function authRoutes(
  service: AuthService,
  options: AuthHttpOptions,
  access?: AccessService,
  website?: WebsiteService,
  invitations?: InvitationService,
) {
  const router = Router();
  const allowedOrigins = new Set([options.origin]);
  const originUrl = new URL(options.origin);
  if (
    !options.secure &&
    ['localhost', '127.0.0.1'].includes(originUrl.hostname)
  ) {
    originUrl.hostname =
      originUrl.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
    allowedOrigins.add(originUrl.origin);
  }
  const prefix = options.secure ? '__Host-' : '';
  const sessionName = `${prefix}ws_session`,
    contextName = `${prefix}ws_context`,
    csrfName = `${prefix}ws_csrf`;
  const cookies: CookieOptions = {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'lax',
    path: '/',
  };
  const cookie = (req: Request, name: string): string | undefined => {
    const value: unknown = req.cookies?.[name];
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
      ? value
      : undefined;
  };
  const token = (req: Request) => cookie(req, sessionName);
  const csrf = doubleCsrf({
    getSecret: () => options.csrfSecret,
    getSessionIdentifier: (req) =>
      token(req)
        ? `session:${digest(token(req)!)}`
        : `preauth:${cookie(req, contextName) ?? ''}`,
    cookieName: csrfName,
    cookieOptions: { ...cookies, sameSite: 'strict' },
    getCsrfTokenFromRequest: (req) => req.get('X-CSRF-Token'),
  });
  router.use(cookieParser());
  router.use(async (_req, _res, next) => {
    if (!(await service.store.ready()))
      throw new HttpError(
        503,
        'SERVICE_UNAVAILABLE',
        'Sign-in is temporarily unavailable. Please try again later.',
      );
    next();
  });
  const envelope = (req: Request, res: Response, data: unknown, status = 200) =>
    res
      .status(status)
      .json({ data, meta: { requestId: res.locals.requestId } });
  const limit = async (
    req: Request,
    res: Response,
    key: string,
    points: number,
  ) => {
    const result = await service.limit(key, points);
    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter);
      throw new HttpError(
        429,
        'RATE_LIMITED',
        'Too many attempts. Please try again later.',
      );
    }
  };
  const clearContext = (res: Response) => {
    res.clearCookie(csrfName, { ...cookies, sameSite: 'strict' });
    res.clearCookie(contextName, cookies);
  };
  const issue = (res: Response, value: string) => {
    clearContext(res);
    res.cookie(sessionName, value, {
      ...cookies,
      maxAge: service.ttlSeconds * 1000,
    });
  };
  router.get('/auth/csrf', async (req, res) => {
    // Block cross-origin token establishment too; normal browser same-origin GETs
    // need not have Origin. Fetch metadata supplies an additional browser signal.
    const origin = req.get('Origin');
    if (
      (origin && !allowedOrigins.has(origin)) ||
      req.get('Sec-Fetch-Site') === 'cross-site'
    )
      throw new HttpError(
        403,
        'CSRF_FAILED',
        'Request could not be verified. Refresh and try again.',
      );
    await limit(req, res, `csrf:${req.ip}`, 120);
    if (!token(req) && !cookie(req, contextName)) {
      const context = opaqueToken();
      req.cookies[contextName] = context;
      res.cookie(contextName, context, { ...cookies, maxAge: 3600000 });
    }
    let csrfToken: string;
    try {
      csrfToken = csrf.generateCsrfToken(req, res);
    } catch {
      csrfToken = csrf.generateCsrfToken(req, res, { overwrite: true });
    }
    envelope(req, res, { csrfToken });
  });
  router.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    if (
      !allowedOrigins.has(req.get('Origin') ?? '') ||
      (!token(req) && !cookie(req, contextName))
    )
      throw new HttpError(
        403,
        'CSRF_FAILED',
        'Request could not be verified. Refresh and try again.',
      );
    csrf.doubleCsrfProtection(req, res, (error?: unknown) => {
      next(
        error
          ? new HttpError(
              403,
              'CSRF_FAILED',
              'Request could not be verified. Refresh and try again.',
            )
          : undefined,
      );
    });
  });
  router.post('/auth/register', async (req, res) => {
    await limit(req, res, `register:${req.ip}`, 5);
    const input = registerSchema.parse(req.body);
    const result = await service.register(
      input,
      token(req),
      String(res.locals.requestId),
    );
    issue(res, result.token);
    envelope(req, res, result.data, 201);
  });
  router.post('/auth/login', async (req, res) => {
    await limit(req, res, `login-ip:${req.ip}`, 30);
    const input = loginSchema.parse(req.body);
    await limit(req, res, `login-email:${input.email}`, 10);
    const result = await service.login(input, token(req));
    issue(res, result.token);
    envelope(req, res, result.data);
  });
  router.get('/auth/me', async (req, res) => {
    const current = await service.resolve(token(req));
    if (!current) {
      res.clearCookie(sessionName, cookies);
      clearContext(res);
      throw new HttpError(
        401,
        token(req) ? 'SESSION_EXPIRED' : 'AUTH_REQUIRED',
        'Please sign in to continue.',
      );
    }
    envelope(req, res, publicIdentity(current));
  });
  router.post('/auth/logout', async (req, res) => {
    const current = await service.resolve(token(req));
    if (!current) {
      res.clearCookie(sessionName, cookies);
      clearContext(res);
      throw new HttpError(
        401,
        'SESSION_EXPIRED',
        'Please sign in to continue.',
      );
    }
    await service.logout(token(req)!);
    res.clearCookie(sessionName, cookies);
    clearContext(res);
    res.status(204).end();
  });
  if (!access)
    router.use(
      ['/team', '/auth/password-reset', '/auth/manager-invitations'],
      () => {
        throw new HttpError(
          503,
          'SERVICE_UNAVAILABLE',
          'Team setup and account recovery are unavailable until email is configured.',
        );
      },
    );
  if (access) {
    const current = async (req: Request) => {
      const actor = await service.resolve(token(req));
      if (!actor)
        throw new HttpError(
          401,
          'AUTH_REQUIRED',
          'Please sign in to continue.',
        );
      await access.ready();
      return actor;
    };
    const precondition = (req: Request) => {
      const match = /^"([1-9][0-9]*)"$/.exec(req.get('If-Match') ?? '');
      if (!match || !Number.isSafeInteger(Number(match[1])))
        throw new HttpError(
          428,
          'PRECONDITION_REQUIRED',
          'Refresh and try again with the current revision.',
        );
      return Number(match[1]);
    };
    const rid = (res: Response) => String(res.locals.requestId);
    router.post('/auth/password-reset/request', async (req, res) => {
      await limit(req, res, `reset-request-ip:${req.ip}`, 10);
      const input = resetRequestSchema.parse(req.body);
      await limit(req, res, `reset-request-email:${input.email}`, 3);
      await access.requestReset(input.email, rid(res));
      envelope(
        req,
        res,
        {
          message:
            'If an active account matches, password reset instructions will be sent.',
        },
        202,
      );
    });
    router.post('/auth/password-reset/confirm', async (req, res) => {
      await limit(req, res, `reset-confirm:${req.ip}`, 20);
      const input = resetConfirmSchema.parse(req.body);
      await access.confirmReset(input.token, input.newPassword, rid(res));
      if (token(req)) await service.logout(token(req)!);
      res.clearCookie(sessionName, cookies);
      clearContext(res);
      res.status(204).end();
    });
    router.post('/auth/manager-invitations/accept', async (req, res) => {
      await limit(req, res, `manager-accept:${req.ip}`, 20);
      const input = acceptManagerSchema.parse(req.body);
      const result = await access.accept(input, token(req), rid(res));
      issue(res, result.token);
      envelope(req, res, result.data, 201);
    });
    router.get('/team', async (req, res) => {
      const page = await access.listMembers(await current(req), req.query);
      res.json({
        data: page.items,
        meta: {
          requestId: res.locals.requestId,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        },
      });
    });
    router.get('/team/invitations', async (req, res) => {
      const page = await access.listInvitations(await current(req), req.query);
      res.json({
        data: page.items,
        meta: {
          requestId: res.locals.requestId,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        },
      });
    });
    router.post('/team/invitations', async (req, res) => {
      const actor = await current(req);
      requireAdmin(actor);
      await limit(req, res, `team-invite:${actor.user._id}`, 20);
      const result = await access.invite(
        actor,
        inviteSchema.parse(req.body),
        rid(res),
      );
      res.setHeader('ETag', `"${result.revision}"`);
      envelope(req, res, result, 201);
    });
    router.post('/team/invitations/:id/resend', async (req, res) => {
      const actor = await current(req);
      requireAdmin(actor);
      await limit(req, res, `team-resend:${actor.user._id}`, 20);
      const result = await access.changeInvitation(
        actor,
        String(req.params.id),
        precondition(req),
        true,
        rid(res),
      );
      res.setHeader('ETag', `"${result.revision}"`);
      envelope(req, res, result, 202);
    });
    router.delete('/team/invitations/:id', async (req, res) => {
      const actor = await current(req);
      requireAdmin(actor);
      await access.changeInvitation(
        actor,
        String(req.params.id),
        precondition(req),
        false,
        rid(res),
      );
      res.status(204).end();
    });
    router.patch('/team/:id', async (req, res) => {
      const actor = await current(req);
      requireAdmin(actor);
      const input = memberStatusSchema.parse(req.body);
      const result = await access.changeMember(
        actor,
        String(req.params.id),
        precondition(req),
        input.status,
        rid(res),
      );
      res.setHeader('ETag', `"${result.revision}"`);
      envelope(req, res, result);
    });
  }
  if (website)
    mountWebsiteRoutes(router, website, async (req) => {
      const actor = await service.resolve(token(req));
      if (!actor)
        throw new HttpError(
          401,
          'AUTH_REQUIRED',
          'Please sign in to continue.',
        );
      return actor;
    });
  if (invitations)
    mountInvitationRoutes(router, invitations, async (req) => {
      const actor = await service.resolve(token(req));
      if (!actor)
        throw new HttpError(
          401,
          'AUTH_REQUIRED',
          'Please sign in to continue.',
        );
      return actor;
    });
  else
    router.use(['/invitations', '/attendance-estimates'], () => {
      throw new HttpError(
        503,
        'SERVICE_UNAVAILABLE',
        'Family invitations require encryption key configuration.',
      );
    });
  router.use(
    (
      error: unknown,
      _req: Request,
      _res: Response,
      next: (error: unknown) => void,
    ) => {
      if (error instanceof ZodError) {
        const validation = new HttpError(
          422,
          'VALIDATION_ERROR',
          'Check the highlighted fields.',
        );
        validation.fields = error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        }));
        next(validation);
      } else next(error);
    },
  );
  return router;
}

export const developmentCsrfSecret = () =>
  randomBytes(32).toString('base64url');
