import { createHash, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { hash, verify, argon2id } from 'argon2';
import { DateTime } from 'luxon';
import type {
  AuthData,
  RegisterInput,
  LoginInput,
} from '@wedding-suite/shared/auth';
import { HttpError } from '../../middleware/errors.js';
import { DuplicateAccountError } from './auth.types.js';
import type {
  AuthStore,
  AuthSnapshot,
  SessionRecord,
  UserRecord,
  WeddingRecord,
} from './auth.types.js';

export const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const opaqueToken = () => randomBytes(32).toString('hex');
export const hashPassword = (password: string) =>
  hash(password, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
export function photoExpiry(mainDate: string, timezone: string): Date {
  return DateTime.fromISO(mainDate, { zone: timezone })
    .startOf('day')
    .plus({ days: 8 })
    .toJSDate();
}
export function weddingSlug(input: RegisterInput['wedding']): string {
  const names =
    `${input.couple.partner1Name}-${input.couple.partner2Name}`
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100)
      .replace(/-$/, '') || 'wedding';
  return `${names}-${input.mainDate.split('-').reverse().join('-')}`;
}
export function publicIdentity(snapshot: AuthSnapshot): AuthData {
  const { user, wedding } = snapshot;
  return {
    user: {
      id: user._id.toHexString(),
      displayName: user.displayName,
      email: user.emailNormalized,
      role: user.role,
    },
    wedding: {
      id: wedding._id.toHexString(),
      couple: wedding.couple,
      mainDate: wedding.mainDate,
      timezone: wedding.timezone,
      slug: wedding.slug,
      publicationStatus: wedding.publicationStatus,
      themeId: wedding.website.themeId,
    },
  };
}
export class AuthService {
  constructor(
    public readonly store: AuthStore,
    public readonly ttlSeconds: number,
    private readonly dummyHash: string,
    public readonly now: () => Date = () => new Date(),
  ) {}
  async resolve(token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return this.store.resolve(digest(token), this.now());
  }
  session(user: UserRecord, token: string): SessionRecord {
    const now = this.now();
    return {
      _id: new ObjectId(),
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      userId: user._id,
      weddingId: user.weddingId,
      tokenHash: digest(token),
      sessionVersion: user.sessionVersion,
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000),
      revokedAt: null,
    };
  }
  async register(
    input: RegisterInput,
    previous?: string,
    requestId = 'auth-service',
  ) {
    if (await this.resolve(previous))
      throw new HttpError(
        409,
        'ACCOUNT_ALREADY_ASSIGNED',
        'You already belong to a wedding.',
      );
    const passwordHash = await hashPassword(input.password);
    const now = this.now(),
      userId = new ObjectId(),
      weddingId = new ObjectId();
    const user: UserRecord = {
      _id: userId,
      weddingId,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      emailNormalized: input.email,
      displayName: input.displayName,
      passwordHash,
      role: 'admin',
      status: 'active',
      sessionVersion: 1,
      passwordChangedAt: now,
    };
    const token = opaqueToken();
    const wedding: WeddingRecord = {
      _id: weddingId,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      couple: input.wedding.couple,
      mainDate: input.wedding.mainDate,
      timezone: input.wedding.timezone,
      slug: weddingSlug(input.wedding),
      slugLockedAt: null,
      publicationStatus: 'draft',
      publishedAt: null,
      website: {
        themeId: input.wedding.themeId,
        intro: '',
        welcomeMessage: '',
        accentColor: '#435438',
        coverPhotoId: null,
      },
      location: null,
      latestAnnouncement: null,
      gallery: {
        uploadsEnabled: true,
        privateLinkEnabled: false,
        privateLinkVersion: 0,
        rotatedAt: null,
      },
      photoExpiryAt: photoExpiry(
        input.wedding.mainDate,
        input.wedding.timezone,
      ),
      retentionVersion: 1,
      mediaCleanup: {
        state: 'idle',
        lastAttemptAt: null,
        completedAt: null,
        errorCode: null,
      },
      revision: 1,
      createdBy: userId,
      updatedBy: userId,
    };
    const baseSlug = wedding.slug;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.store.register(
          { user, wedding, session: this.session(user, token), requestId },
          previous ? digest(previous) : undefined,
        );
        return { data: publicIdentity({ user, wedding }), token };
      } catch (error) {
        if (!(error instanceof DuplicateAccountError)) throw error;
        if (error.field === 'email')
          throw new HttpError(
            409,
            'EMAIL_ALREADY_REGISTERED',
            'An account already uses this email. Sign in instead.',
          );
        wedding.slug = `${baseSlug}-${randomBytes(3).toString('hex')}`;
      }
    }
    throw new HttpError(
      503,
      'SERVICE_UNAVAILABLE',
      'Please try creating your wedding again.',
    );
  }
  async login(input: LoginInput, previous?: string) {
    const user = await this.store.findUser(input.email);
    const matches = await verify(
      user?.passwordHash ?? this.dummyHash,
      input.password,
    ).catch(() => false);
    if (!matches || !user || user.status !== 'active')
      throw new HttpError(
        401,
        'INVALID_CREDENTIALS',
        'Email or password is incorrect.',
      );
    const token = opaqueToken();
    const snapshot = await this.store.loginSession(
      user,
      this.session(user, token),
      previous ? digest(previous) : undefined,
    );
    if (!snapshot)
      throw new HttpError(
        401,
        'INVALID_CREDENTIALS',
        'Email or password is incorrect.',
      );
    return { data: publicIdentity(snapshot), token };
  }
  async logout(token: string) {
    await this.store.revoke(digest(token), this.now());
  }
  async limit(key: string, points: number, seconds = 900) {
    const window = Math.floor(this.now().getTime() / (seconds * 1000));
    const expiresAt = new Date((window + 1) * seconds * 1000);
    const count = await this.store.consume(
      digest(`${key}:${window}`),
      expiresAt,
    );
    return {
      allowed: count <= points,
      retryAfter: Math.max(
        1,
        Math.ceil((expiresAt.getTime() - this.now().getTime()) / 1000),
      ),
    };
  }
}
export async function createAuthService(
  store: AuthStore,
  ttlSeconds = 86400,
  now?: () => Date,
) {
  return new AuthService(
    store,
    ttlSeconds,
    await hashPassword(opaqueToken()),
    now,
  );
}
