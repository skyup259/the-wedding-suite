import { BSON } from 'mongodb';
import type { ObjectId } from 'mongodb';
import type { AuthSnapshot } from '../../src/modules/auth/auth.types.js';
import type {
  WebsiteStore,
  WebsiteSnapshot,
  WebsiteChange,
  EventRecord,
} from '../../src/modules/website/website.types.js';
import { HttpError } from '../../src/middleware/errors.js';
import type { MemoryAuthStore } from './memory-auth-store.js';
export const clone = <T>(value: T): T =>
  BSON.deserialize(BSON.serialize({ value })).value as T;
export class MemoryWebsiteStore implements WebsiteStore {
  migrated = true;
  failAudit = false;
  events = new Map<string, EventRecord>();
  references: Record<string, number> = {};
  audits: string[] = [];
  private lock: Promise<void> = Promise.resolve();
  constructor(public auth: MemoryAuthStore) {}
  async ready() {
    return this.migrated;
  }
  async read(weddingId: ObjectId) {
    const w = this.auth.weddings.get(weddingId.toHexString());
    return w
      ? clone({
          wedding: w,
          events: [...this.events.values()].filter((e) =>
            e.weddingId.equals(weddingId),
          ),
          references: this.references,
        })
      : null;
  }
  async publicRead(slug: string) {
    const w = [...this.auth.weddings.values()].find(
      (w) => w.slug === slug && w.publicationStatus === 'published',
    );
    return w ? this.read(w._id) : null;
  }
  async mutate(
    actor: AuthSnapshot,
    work: (s: WebsiteSnapshot) => WebsiteChange,
  ) {
    const prior = this.lock;
    let release: () => void = () => {};
    this.lock = new Promise((r) => {
      release = r;
    });
    await prior;
    try {
      const user = this.auth.users.get(actor.user._id.toHexString());
      if (
        !user ||
        user.status !== 'active' ||
        user.sessionVersion !== actor.user.sessionVersion
      )
        throw new HttpError(401, 'SESSION_EXPIRED', 'Please sign in again.');
      const snapshot = await this.read(actor.user.weddingId);
      if (!snapshot)
        throw new HttpError(404, 'NOT_FOUND', 'Wedding not found.');
      const change = work(snapshot);
      if (this.failAudit) throw new Error('Synthetic audit failure');
      if (
        [...this.auth.weddings.values()].some(
          (w) =>
            !w._id.equals(change.wedding._id) && w.slug === change.wedding.slug,
        )
      )
        throw new HttpError(409, 'SLUG_CONFLICT', 'Address unavailable.');
      this.auth.weddings.set(
        change.wedding._id.toHexString(),
        clone(change.wedding),
      );
      if (change.event)
        this.events.set(change.event._id.toHexString(), clone(change.event));
      this.audits.push(change.action);
      return clone(change);
    } finally {
      release();
    }
  }
}
