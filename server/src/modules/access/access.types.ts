import type { ObjectId } from 'mongodb';
import type {
  AuthSnapshot,
  UserRecord,
  SessionRecord,
  WeddingRecord,
} from '../auth/auth.types.js';
export interface AccessToken {
  _id: ObjectId;
  weddingId: ObjectId;
  purpose: 'manager_invite' | 'password_reset';
  tokenHash: string;
  emailNormalized: string;
  displayName: string | null;
  userId: ObjectId | null;
  invitedBy: ObjectId;
  sessionVersion: number | null;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  revision: number;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface EmailJob {
  _id: ObjectId;
  weddingId: ObjectId;
  type: 'auth_email';
  tokenId: ObjectId;
  tokenRevision: number;
  payload: string | null;
  idempotencyKey: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  outcome: 'accepted' | 'outbox' | 'cancelled' | null;
  attempts: number;
  maxAttempts: number;
  nextRunAt: Date;
  leaseUntil: Date | null;
  leaseOwner: string | null;
  leaseVersion: number;
  firstAttemptAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  errorCode: string | null;
}
export interface AccessUnit {
  userByEmail(email: string): Promise<UserRecord | null>;
  userById(id: ObjectId, weddingId: ObjectId): Promise<UserRecord | null>;
  wedding(id: ObjectId): Promise<WeddingRecord | null>;
  tokenByHash(
    hash: string,
    purpose: AccessToken['purpose'],
  ): Promise<AccessToken | null>;
  tokenById(id: ObjectId, weddingId: ObjectId): Promise<AccessToken | null>;
  invitationByEmail(
    email: string,
    weddingId: ObjectId,
  ): Promise<AccessToken | null>;
  saveToken(token: AccessToken): Promise<void>;
  saveUser(user: UserRecord): Promise<void>;
  insertSession(session: SessionRecord, previousHash?: string): Promise<void>;
  revokeSessions(userId: ObjectId, now: Date): Promise<void>;
  invalidateTokens(userId: ObjectId, now: Date): Promise<void>;
  cancelEmails(tokenId: ObjectId, now: Date): Promise<void>;
  enqueue(job: EmailJob): Promise<void>;
  audit(
    weddingId: ObjectId,
    actorId: ObjectId,
    entityId: ObjectId,
    action: string,
    now: Date,
    requestId: string,
  ): Promise<void>;
}
export interface AccessStore {
  ready(): Promise<boolean>;
  transaction<T>(
    actor: AuthSnapshot | null,
    work: (unit: AccessUnit) => Promise<T>,
  ): Promise<T>;
  members(
    weddingId: ObjectId,
    after?: ObjectId,
    limit?: number,
  ): Promise<UserRecord[]>;
  invitations(
    weddingId: ObjectId,
    after?: ObjectId,
    limit?: number,
  ): Promise<AccessToken[]>;
  deliveries(weddingId: ObjectId, tokenIds: ObjectId[]): Promise<EmailJob[]>;
  claim(owner: string, now: Date): Promise<EmailJob | null>;
  validJob(job: EmailJob, now: Date): Promise<boolean>;
  finish(job: EmailJob, now: Date, outcome: EmailJob['outcome']): Promise<void>;
  fail(
    job: EmailJob,
    now: Date,
    code: string,
    permanent: boolean,
  ): Promise<void>;
}
