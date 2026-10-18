import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type {
  acceptManagerSchema,
  inviteSchema,
} from '@wedding-suite/shared/access';
import { HttpError } from '../../middleware/errors.js';
import {
  digest,
  hashPassword,
  opaqueToken,
  publicIdentity,
} from '../auth/auth.service.js';
import type { AuthService } from '../auth/auth.service.js';
import type { AuthSnapshot, UserRecord } from '../auth/auth.types.js';
import type {
  AccessStore,
  AccessToken,
  AccessUnit,
  EmailJob,
} from './access.types.js';
import type { EmailVault } from '../../infrastructure/email.js';
export function objectId(value: string) {
  if (!/^[a-f0-9]{24}$/.test(value))
    throw new HttpError(404, 'NOT_FOUND', 'Resource not found.');
  return new ObjectId(value);
}
export function requireAdmin(actor: AuthSnapshot) {
  if (actor.user.role !== 'admin')
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Only the Admin can manage team access.',
    );
}
function linkError() {
  return new HttpError(
    400,
    'INVALID_SETUP_LINK',
    'This link is invalid or has already been used. Request a new link.',
  );
}
function usable(
  token: AccessToken | null,
  now: Date,
): asserts token is AccessToken {
  if (!token || token.usedAt || token.revokedAt) throw linkError();
  if (token.expiresAt <= now)
    throw new HttpError(
      410,
      'SETUP_LINK_EXPIRED',
      'This link has expired. Request a new link.',
    );
}
function revision(current: number, expected: number) {
  if (current !== expected)
    throw new HttpError(
      412,
      'REVISION_CONFLICT',
      'This record changed. Refresh before trying again.',
    );
}
export class AccessService {
  constructor(
    public readonly store: AccessStore,
    private auth: AuthService,
    private vault: EmailVault,
    private origin: string,
    private inviteSeconds = 172800,
    private resetSeconds = 3600,
  ) {}
  private get now() {
    return this.auth.now();
  }
  async ready() {
    if (!(await this.store.ready()))
      throw new HttpError(
        503,
        'SERVICE_UNAVAILABLE',
        'Account setup is temporarily unavailable. Please try later.',
      );
  }
  private page(actor: AuthSnapshot, kind: string, query: unknown) {
    const input = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        cursor: z.string().max(512).optional(),
      })
      .parse(query);
    let after: ObjectId | undefined;
    if (input.cursor) {
      try {
        const cursor = z
          .strictObject({
            wedding: z.string(),
            kind: z.string(),
            after: z.string().regex(/^[a-f0-9]{24}$/),
          })
          .parse(
            JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')),
          );
        if (
          cursor.wedding !== actor.user.weddingId.toHexString() ||
          cursor.kind !== kind
        )
          throw new Error('Wrong cursor scope');
        after = new ObjectId(cursor.after);
      } catch {
        throw new HttpError(
          422,
          'VALIDATION_ERROR',
          'This page cursor is invalid. Reload the list.',
        );
      }
    }
    return {
      limit: input.limit,
      after,
      next: (id: ObjectId) =>
        Buffer.from(
          JSON.stringify({
            wedding: actor.user.weddingId.toHexString(),
            kind,
            after: id.toHexString(),
          }),
        ).toString('base64url'),
    };
  }
  async listMembers(actor: AuthSnapshot, query: unknown = {}) {
    const page = this.page(actor, 'members', query),
      users = await this.store.members(
        actor.user.weddingId,
        page.after,
        page.limit + 1,
      ),
      hasMore = users.length > page.limit,
      rows = users.slice(0, page.limit);
    return {
      items: rows.map((user) => ({
        id: user._id.toHexString(),
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        revision: user.teamRevision ?? 1,
        ...(actor.user.role === 'admin' ? { email: user.emailNormalized } : {}),
      })),
      hasMore,
      nextCursor: hasMore ? page.next(rows.at(-1)!._id) : null,
    };
  }
  async listInvitations(actor: AuthSnapshot, query: unknown = {}) {
    requireAdmin(actor);
    const page = this.page(actor, 'invitations', query),
      all = await this.store.invitations(
        actor.user.weddingId,
        page.after,
        page.limit + 1,
      ),
      hasMore = all.length > page.limit,
      tokens = all.slice(0, page.limit),
      jobs = await this.store.deliveries(
        actor.user.weddingId,
        tokens.map((t) => t._id),
      );
    const items = tokens.map((t) => {
      const job = jobs.find((j) => j.tokenId.equals(t._id));
      return {
        id: t._id.toHexString(),
        email: t.emailNormalized,
        displayName: t.displayName,
        status: t.usedAt
          ? 'used'
          : t.revokedAt
            ? 'revoked'
            : t.expiresAt <= this.now
              ? 'expired'
              : 'pending',
        expiresAt: t.expiresAt.toISOString(),
        revision: t.revision,
        delivery: job
          ? job.status === 'completed'
            ? (job.outcome ?? 'failed')
            : job.status
          : 'failed',
      };
    });
    return {
      items,
      hasMore,
      nextCursor: hasMore ? page.next(tokens.at(-1)!._id) : null,
    };
  }
  private async queue(unit: AccessUnit, token: AccessToken, raw: string) {
    const now = this.now,
      id = new ObjectId();
    const link = `${this.origin}/${token.purpose === 'manager_invite' ? 'accept-invitation' : 'reset-password'}#token=${raw}`;
    const mail = {
      to: token.emailNormalized,
      subject:
        token.purpose === 'manager_invite'
          ? 'Join your wedding team'
          : 'Reset your Wedding Suite password',
      text:
        token.purpose === 'manager_invite'
          ? `You have been invited to help manage a wedding in The Wedding Suite. Set your password here: ${link}\nThis link expires at ${token.expiresAt.toISOString()} and can be used once. If you were not expecting this invitation, ignore this email.`
          : `Reset your password here: ${link}\nThis link expires at ${token.expiresAt.toISOString()} and can be used once. If you did not request this, ignore this email.`,
    };
    const job: EmailJob = {
      _id: id,
      weddingId: token.weddingId,
      type: 'auth_email',
      tokenId: token._id,
      tokenRevision: token.revision,
      payload: this.vault.seal(mail, id.toHexString()),
      idempotencyKey: `auth-email/${id.toHexString()}`,
      status: 'queued',
      outcome: null,
      attempts: 0,
      maxAttempts: 8,
      nextRunAt: now,
      leaseUntil: null,
      leaseOwner: null,
      leaseVersion: 0,
      firstAttemptAt: null,
      expiresAt: token.expiresAt,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      errorCode: null,
    };
    await unit.enqueue(job);
  }
  async invite(
    actor: AuthSnapshot,
    input: z.infer<typeof inviteSchema>,
    requestId: string,
  ) {
    requireAdmin(actor);
    await this.ready();
    return this.store.transaction(actor, async (unit) => {
      if (await unit.userByEmail(input.email))
        throw new HttpError(
          409,
          'ACCOUNT_ALREADY_ASSIGNED',
          'This email already belongs to an account.',
        );
      const old = await unit.invitationByEmail(
        input.email,
        actor.user.weddingId,
      );
      if (old && !old.revokedAt && !old.usedAt && old.expiresAt > this.now)
        throw new HttpError(
          409,
          'INVITATION_EXISTS',
          'A pending invitation already exists. Use Resend instead.',
        );
      const now = this.now,
        raw = opaqueToken();
      const token: AccessToken = {
        _id: old?._id ?? new ObjectId(),
        weddingId: actor.user.weddingId,
        purpose: 'manager_invite',
        tokenHash: digest(raw),
        emailNormalized: input.email,
        displayName: input.displayName ?? null,
        userId: null,
        invitedBy: actor.user._id,
        sessionVersion: null,
        expiresAt: new Date(now.getTime() + this.inviteSeconds * 1000),
        usedAt: null,
        revokedAt: null,
        revision: (old?.revision ?? 0) + 1,
        schemaVersion: 1,
        createdAt: old?.createdAt ?? now,
        updatedAt: now,
      };
      if (old) await unit.cancelEmails(old._id, now);
      await unit.saveToken(token);
      await this.queue(unit, token, raw);
      await unit.audit(
        token.weddingId,
        actor.user._id,
        token._id,
        'manager_invited',
        now,
        requestId,
      );
      return {
        id: token._id.toHexString(),
        revision: token.revision,
        status: 'pending',
        delivery: 'queued',
      };
    });
  }
  async changeInvitation(
    actor: AuthSnapshot,
    id: string,
    expected: number,
    resend: boolean,
    requestId: string,
  ) {
    requireAdmin(actor);
    await this.ready();
    const oid = objectId(id);
    return this.store.transaction(actor, async (unit) => {
      const token = await unit.tokenById(oid, actor.user.weddingId);
      if (!token)
        throw new HttpError(404, 'NOT_FOUND', 'Invitation not found.');
      revision(token.revision, expected);
      if (token.usedAt || token.revokedAt) throw linkError();
      const now = this.now;
      await unit.cancelEmails(token._id, now);
      token.revision++;
      token.updatedAt = now;
      if (resend) {
        if (await unit.userByEmail(token.emailNormalized))
          throw new HttpError(
            409,
            'ACCOUNT_ALREADY_ASSIGNED',
            'This email already belongs to an account.',
          );
        const raw = opaqueToken();
        token.tokenHash = digest(raw);
        token.expiresAt = new Date(now.getTime() + this.inviteSeconds * 1000);
        await unit.saveToken(token);
        await this.queue(unit, token, raw);
      } else {
        token.revokedAt = now;
        await unit.saveToken(token);
      }
      await unit.audit(
        token.weddingId,
        actor.user._id,
        token._id,
        resend ? 'manager_invitation_resent' : 'manager_invitation_revoked',
        now,
        requestId,
      );
      return {
        id: token._id.toHexString(),
        revision: token.revision,
        delivery: resend ? 'queued' : 'cancelled',
      };
    });
  }
  async accept(
    input: z.infer<typeof acceptManagerSchema>,
    previous: string | undefined,
    requestId: string,
  ) {
    await this.ready();
    if (await this.auth.resolve(previous))
      throw new HttpError(
        409,
        'ACCOUNT_ALREADY_ASSIGNED',
        'Sign out before accepting a team invitation.',
      );
    const passwordHash = await hashPassword(input.password),
      rawSession = opaqueToken();
    const snapshot = await this.store.transaction(null, async (unit) => {
      const now = this.now;
      const token = await unit.tokenByHash(
        digest(input.token),
        'manager_invite',
      );
      usable(token, now);
      if (await unit.userByEmail(token.emailNormalized))
        throw new HttpError(
          409,
          'ACCOUNT_ALREADY_ASSIGNED',
          'This email already belongs to an account.',
        );
      const wedding = await unit.wedding(token.weddingId);
      if (!wedding) throw linkError();
      const user: UserRecord = {
        _id: new ObjectId(),
        weddingId: token.weddingId,
        emailNormalized: token.emailNormalized,
        displayName: input.displayName,
        passwordHash,
        role: 'manager',
        status: 'active',
        sessionVersion: 1,
        passwordChangedAt: now,
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
        teamRevision: 1,
      };
      token.usedAt = now;
      token.updatedAt = now;
      token.revision++;
      await unit.saveToken(token);
      await unit.saveUser(user);
      await unit.insertSession(
        this.auth.session(user, rawSession),
        previous ? digest(previous) : undefined,
      );
      await unit.cancelEmails(token._id, now);
      await unit.audit(
        token.weddingId,
        user._id,
        user._id,
        'manager_accepted',
        now,
        requestId,
      );
      return { user, wedding };
    });
    return { data: publicIdentity(snapshot), token: rawSession };
  }
  async requestReset(email: string, requestId: string) {
    await this.ready();
    await this.store.transaction(null, async (unit) => {
      const user = await unit.userByEmail(email);
      if (!user || user.status !== 'active') return;
      // Updating the user serializes concurrent recovery requests and account disablement.
      user.updatedAt = this.now;
      await unit.saveUser({
        ...user,
        accessRevision: (user.accessRevision ?? 0) + 1,
      });
      const now = this.now,
        raw = opaqueToken();
      await unit.invalidateTokens(user._id, now);
      const token: AccessToken = {
        _id: new ObjectId(),
        weddingId: user.weddingId,
        purpose: 'password_reset',
        tokenHash: digest(raw),
        emailNormalized: user.emailNormalized,
        displayName: null,
        userId: user._id,
        invitedBy: user._id,
        sessionVersion: user.sessionVersion,
        expiresAt: new Date(now.getTime() + this.resetSeconds * 1000),
        usedAt: null,
        revokedAt: null,
        revision: 1,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      };
      await unit.saveToken(token);
      await this.queue(unit, token, raw);
      await unit.audit(
        user.weddingId,
        user._id,
        user._id,
        'password_reset_requested',
        now,
        requestId,
      );
    });
  }
  async confirmReset(
    tokenValue: string,
    newPassword: string,
    requestId: string,
  ) {
    await this.ready();
    const passwordHash = await hashPassword(newPassword);
    await this.store.transaction(null, async (unit) => {
      const now = this.now;
      const token = await unit.tokenByHash(
        digest(tokenValue),
        'password_reset',
      );
      usable(token, now);
      const user = await unit.userById(token.userId!, token.weddingId);
      if (
        !user ||
        user.status !== 'active' ||
        user.sessionVersion !== token.sessionVersion
      )
        throw linkError();
      user.passwordHash = passwordHash;
      user.passwordChangedAt = now;
      user.updatedAt = now;
      user.sessionVersion++;
      token.usedAt = now;
      token.revision++;
      token.updatedAt = now;
      await unit.saveUser(user);
      await unit.saveToken(token);
      await unit.invalidateTokens(user._id, now);
      await unit.revokeSessions(user._id, now);
      await unit.cancelEmails(token._id, now);
      await unit.audit(
        user.weddingId,
        user._id,
        user._id,
        'password_reset_completed',
        now,
        requestId,
      );
    });
  }
  async changeMember(
    actor: AuthSnapshot,
    id: string,
    expected: number,
    status: 'active' | 'disabled',
    requestId: string,
  ) {
    requireAdmin(actor);
    await this.ready();
    const oid = objectId(id);
    return this.store.transaction(actor, async (unit) => {
      const user = await unit.userById(oid, actor.user.weddingId);
      if (!user)
        throw new HttpError(404, 'NOT_FOUND', 'Team member not found.');
      if (user.role !== 'manager')
        throw new HttpError(403, 'FORBIDDEN', 'The Admin cannot be disabled.');
      revision(user.teamRevision ?? 1, expected);
      user.status = status;
      user.teamRevision = (user.teamRevision ?? 1) + 1;
      user.updatedAt = this.now;
      user.sessionVersion++;
      await unit.saveUser(user);
      await unit.revokeSessions(user._id, this.now);
      await unit.invalidateTokens(user._id, this.now);
      await unit.audit(
        user.weddingId,
        actor.user._id,
        user._id,
        status === 'disabled' ? 'manager_disabled' : 'manager_enabled',
        this.now,
        requestId,
      );
      return {
        id: user._id.toHexString(),
        displayName: user.displayName,
        email: user.emailNormalized,
        role: user.role,
        status: user.status,
        revision: user.teamRevision,
      };
    });
  }
}
