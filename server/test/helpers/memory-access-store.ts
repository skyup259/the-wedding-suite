import type { ObjectId } from 'mongodb';
import type { AuthSnapshot } from '../../src/modules/auth/auth.types.js';
import { HttpError } from '../../src/middleware/errors.js';
import type {
  AccessStore,
  AccessUnit,
  AccessToken,
  EmailJob,
} from '../../src/modules/access/access.types.js';
import type { MemoryAuthStore } from './memory-auth-store.js';
const copy = <T extends object>(value: T | null | undefined): T | null =>
  value ? { ...value } : null;
// Transactional substitute for credential-free HTTP/worker tests. MongoDB
// transactions, validators and claim races are exercised in integration tests.
export class MemoryAccessStore implements AccessStore {
  migrated = true;
  failAudit = false;
  tokens = new Map<string, AccessToken>();
  jobs = new Map<string, EmailJob>();
  audits: string[] = [];
  private lock: Promise<void> = Promise.resolve();
  constructor(public auth: MemoryAuthStore) {}
  async ready() {
    return this.migrated;
  }
  async transaction<T>(
    actor: AuthSnapshot | null,
    work: (unit: AccessUnit) => Promise<T>,
  ) {
    const prior = this.lock;
    let release: () => void = () => {};
    this.lock = new Promise((resolve) => {
      release = resolve;
    });
    await prior;
    const snapshots = {
      users: new Map(this.auth.users),
      sessions: new Map(this.auth.sessions),
      tokens: new Map(this.tokens),
      jobs: new Map(this.jobs),
      audits: [...this.audits],
    };
    try {
      if (actor) {
        const user = this.auth.users.get(actor.user._id.toHexString());
        if (
          !user ||
          user.status !== 'active' ||
          user.sessionVersion !== actor.user.sessionVersion ||
          user.role !== actor.user.role
        )
          throw new HttpError(401, 'SESSION_EXPIRED', 'Please sign in again.');
      }
      const unit: AccessUnit = {
        userByEmail: async (email) => copy(await this.auth.findUser(email)),
        userById: async (id, weddingId) => {
          const user = this.auth.users.get(id.toHexString());
          return user?.weddingId.equals(weddingId) ? copy(user) : null;
        },
        wedding: async (id) => copy(this.auth.weddings.get(id.toHexString())),
        tokenByHash: async (hash, purpose) =>
          copy(
            [...this.tokens.values()].find(
              (t) => t.tokenHash === hash && t.purpose === purpose,
            ),
          ),
        tokenById: async (id, weddingId) => {
          const t = this.tokens.get(id.toHexString());
          return t?.purpose === 'manager_invite' &&
            t.weddingId.equals(weddingId)
            ? copy(t)
            : null;
        },
        invitationByEmail: async (email, weddingId) =>
          copy(
            [...this.tokens.values()].find(
              (t) =>
                t.purpose === 'manager_invite' &&
                t.emailNormalized === email &&
                t.weddingId.equals(weddingId),
            ),
          ),
        saveToken: async (token) => {
          this.tokens.set(token._id.toHexString(), { ...token });
        },
        saveUser: async (user) => {
          const existing = await this.auth.findUser(user.emailNormalized);
          if (existing && !existing._id.equals(user._id))
            throw new HttpError(
              409,
              'ACCOUNT_ALREADY_ASSIGNED',
              'Already assigned.',
            );
          this.auth.users.set(user._id.toHexString(), { ...user });
        },
        insertSession: async (session, previous) => {
          this.auth.sessions.set(session.tokenHash, { ...session });
          if (previous) {
            const old = this.auth.sessions.get(previous);
            if (old)
              this.auth.sessions.set(previous, {
                ...old,
                revokedAt: session.createdAt,
              });
          }
        },
        revokeSessions: async (userId, now) => {
          for (const [id, s] of this.auth.sessions)
            if (s.userId.equals(userId))
              this.auth.sessions.set(id, { ...s, revokedAt: now });
        },
        invalidateTokens: async (userId, now) => {
          for (const [id, t] of this.tokens)
            if (
              t.userId?.equals(userId) &&
              t.purpose === 'password_reset' &&
              !t.usedAt &&
              !t.revokedAt
            )
              this.tokens.set(id, {
                ...t,
                revokedAt: now,
                revision: t.revision + 1,
                updatedAt: now,
              });
        },
        cancelEmails: async (tokenId, now) => {
          for (const [id, j] of this.jobs)
            if (
              j.tokenId.equals(tokenId) &&
              ['queued', 'running'].includes(j.status)
            )
              this.jobs.set(id, {
                ...j,
                status: 'completed',
                outcome: 'cancelled',
                payload: null,
                leaseOwner: null,
                leaseUntil: null,
                completedAt: now,
              });
        },
        enqueue: async (job) => {
          this.jobs.set(job._id.toHexString(), { ...job });
        },
        audit: async (_w, _a, _e, action) => {
          if (this.failAudit) throw new Error('Synthetic audit failure');
          this.audits.push(action);
        },
      };
      return await work(unit);
    } catch (e) {
      this.auth.users = snapshots.users;
      this.auth.sessions = snapshots.sessions;
      this.tokens = snapshots.tokens;
      this.jobs = snapshots.jobs;
      this.audits = snapshots.audits;
      throw e;
    } finally {
      release();
    }
  }
  async members(weddingId: ObjectId, after?: ObjectId, limit = 21) {
    return [...this.auth.users.values()]
      .filter(
        (u) =>
          u.weddingId.equals(weddingId) &&
          (!after || u._id.toHexString() > after.toHexString()),
      )
      .sort((a, b) => a._id.toHexString().localeCompare(b._id.toHexString()))
      .slice(0, limit)
      .map((u) => ({ ...u }));
  }
  async invitations(weddingId: ObjectId, after?: ObjectId, limit = 21) {
    return [...this.tokens.values()]
      .filter(
        (t) =>
          t.weddingId.equals(weddingId) &&
          t.purpose === 'manager_invite' &&
          (!after || t._id.toHexString() > after.toHexString()),
      )
      .sort((a, b) => a._id.toHexString().localeCompare(b._id.toHexString()))
      .slice(0, limit)
      .map((t) => ({ ...t }));
  }
  async deliveries(weddingId: ObjectId, tokenIds: ObjectId[]) {
    return [...this.jobs.values()]
      .filter(
        (j) =>
          j.weddingId.equals(weddingId) &&
          tokenIds.some((id) => id.equals(j.tokenId)),
      )
      .reverse()
      .map((j) => ({ ...j }));
  }
  async claim(owner: string, now: Date) {
    const job = [...this.jobs.values()].find(
      (j) =>
        (j.status === 'queued' && j.nextRunAt <= now) ||
        (j.status === 'running' && j.leaseUntil && j.leaseUntil <= now),
    );
    if (!job) return null;
    const claimed: EmailJob = {
      ...job,
      status: 'running',
      leaseOwner: owner,
      leaseUntil: new Date(now.getTime() + 60000),
      attempts: job.attempts + 1,
      leaseVersion: job.leaseVersion + 1,
      firstAttemptAt: job.firstAttemptAt ?? now,
    };
    this.jobs.set(job._id.toHexString(), claimed);
    return { ...claimed };
  }
  async validJob(job: EmailJob, now: Date) {
    if (!this.current(job, now)) return false;
    const t = this.tokens.get(job.tokenId.toHexString());
    if (
      !t ||
      t.revision !== job.tokenRevision ||
      t.usedAt ||
      t.revokedAt ||
      t.expiresAt <= now
    )
      return false;
    if (t.purpose === 'password_reset') {
      const u = this.auth.users.get(t.userId!.toHexString());
      return u?.status === 'active' && u.sessionVersion === t.sessionVersion;
    }
    return true;
  }
  private current(job: EmailJob, now: Date) {
    const j = this.jobs.get(job._id.toHexString());
    return j?.status === 'running' &&
      j.leaseOwner === job.leaseOwner &&
      j.leaseVersion === job.leaseVersion &&
      j.leaseUntil! > now
      ? j
      : null;
  }
  async finish(job: EmailJob, now: Date, outcome: EmailJob['outcome']) {
    const j = this.current(job, now);
    if (j)
      this.jobs.set(j._id.toHexString(), {
        ...j,
        status: 'completed',
        outcome,
        payload: null,
        leaseOwner: null,
        leaseUntil: null,
        completedAt: now,
      });
  }
  async fail(job: EmailJob, now: Date, code: string, permanent: boolean) {
    const j = this.current(job, now);
    if (!j) return;
    const terminal = permanent || j.attempts >= j.maxAttempts;
    this.jobs.set(j._id.toHexString(), {
      ...j,
      status: terminal ? 'failed' : 'queued',
      payload: terminal ? null : j.payload,
      errorCode: code,
      leaseOwner: null,
      leaseUntil: null,
      nextRunAt: new Date(now.getTime() + 30000 * 2 ** (j.attempts - 1)),
    });
  }
}
