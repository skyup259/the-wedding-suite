import type {
  AuthStore,
  RegistrationRecords,
  SessionRecord,
  UserRecord,
  WeddingRecord,
} from '../../src/modules/auth/auth.types.js';
import { DuplicateAccountError } from '../../src/modules/auth/auth.types.js';

// Test-only substitute. Transaction/index behaviour is verified against Atlas separately.
export class MemoryAuthStore implements AuthStore {
  migrated = true;
  users = new Map<string, UserRecord>();
  weddings = new Map<string, WeddingRecord>();
  sessions = new Map<string, SessionRecord>();
  counters = new Map<string, number>();
  async ready() {
    return this.migrated;
  }
  async findUser(email: string) {
    return (
      [...this.users.values()].find((user) => user.emailNormalized === email) ??
      null
    );
  }
  async resolve(hash: string, now: Date) {
    const session = this.sessions.get(hash);
    if (!session || session.revokedAt || session.expiresAt <= now) return null;
    const user = this.users.get(session.userId.toHexString());
    if (
      !user ||
      user.status !== 'active' ||
      user.sessionVersion !== session.sessionVersion ||
      !user.weddingId.equals(session.weddingId)
    )
      return null;
    const wedding = this.weddings.get(session.weddingId.toHexString());
    return wedding ? { user, wedding } : null;
  }
  async register(records: RegistrationRecords, previous?: string) {
    if (await this.findUser(records.user.emailNormalized))
      throw new DuplicateAccountError('email');
    if (
      [...this.weddings.values()].some((w) => w.slug === records.wedding.slug)
    )
      throw new DuplicateAccountError('slug');
    this.users.set(records.user._id.toHexString(), records.user);
    this.weddings.set(records.wedding._id.toHexString(), records.wedding);
    this.sessions.set(records.session.tokenHash, records.session);
    if (previous) await this.revoke(previous, records.session.createdAt);
  }
  async loginSession(
    user: UserRecord,
    session: SessionRecord,
    previous?: string,
  ) {
    if (user.status !== 'active') return null;
    this.sessions.set(session.tokenHash, session);
    if (previous) await this.revoke(previous, session.createdAt);
    return { user, wedding: this.weddings.get(user.weddingId.toHexString())! };
  }
  async revoke(hash: string, now: Date) {
    const session = this.sessions.get(hash);
    if (session) session.revokedAt = now;
  }
  async consume(key: string) {
    const count = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, count);
    return count;
  }
}
