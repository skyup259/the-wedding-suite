import type { ObjectId } from 'mongodb';
import type { AuthSnapshot } from '../../src/modules/auth/auth.types.js';
import type {
  InvitationStore,
  InvitationRecord,
  InvitationContext,
  InvitationFilter,
} from '../../src/modules/invitations/invitations.types.js';
import { HttpError } from '../../src/middleware/errors.js';
import { clone, MemoryWebsiteStore } from './memory-website-store.js';
export class MemoryInvitationStore implements InvitationStore {
  migrated = true;
  failAudit = false;
  invitations = new Map<string, InvitationRecord>();
  audits: string[] = [];
  private lock: Promise<void> = Promise.resolve();
  constructor(public website: MemoryWebsiteStore) {
    website.invitationReferences = (id) =>
      [...this.invitations.values()].filter(
        (i) =>
          i.weddingId.equals(
            [...website.events.values()].find((e) => e._id.equals(id))
              ?.weddingId ?? id,
          ) && i.eventIds.some((e) => e.equals(id)),
      ).length;
  }
  async ready() {
    return this.migrated;
  }
  async read(weddingId: ObjectId, id: ObjectId) {
    const s = await this.website.read(weddingId);
    if (!s) return null;
    const i = this.invitations.get(id.toHexString());
    return {
      ...s,
      invitation: i?.weddingId.equals(weddingId) ? clone(i) : null,
    };
  }
  async list(weddingId: ObjectId, f: InvitationFilter) {
    return clone(
      [...this.invitations.values()]
        .filter(
          (i) =>
            i.weddingId.equals(weddingId) &&
            !i.archivedAt &&
            (!f.sentStatus || i.sentStatus === f.sentStatus) &&
            (!f.eventId || i.eventIds.some((id) => id.equals(f.eventId!))) &&
            (!f.search ||
              [i.familyDisplayName, i.contactName].some((v) =>
                v.toLowerCase().includes(f.search.toLowerCase()),
              )) &&
            (!f.after ||
              i.createdAt < f.after.date ||
              (+i.createdAt === +f.after.date &&
                i._id.toHexString() < f.after.id.toHexString())),
        )
        .sort(
          (a, b) =>
            +b.createdAt - +a.createdAt ||
            b._id.toHexString().localeCompare(a._id.toHexString()),
        )
        .slice(0, f.limit + 1),
    );
  }
  async overview(weddingId: ObjectId) {
    const s = await this.website.read(weddingId);
    if (!s) return null;
    const all = [...this.invitations.values()].filter(
        (i) => i.weddingId.equals(weddingId) && !i.archivedAt,
      ),
      sent = all.filter((i) => i.sentStatus === 'sent'),
      counts: Record<string, number> = {};
    for (const i of sent)
      for (const id of new Set(i.eventIds.map(String)))
        counts[id] = (counts[id] ?? 0) + 1;
    return {
      ...s,
      totalFamilies: all.length,
      sentFamilies: sent.length,
      counts,
    };
  }
  async publicRead(slug: string, tokenHash: string) {
    const s = await this.website.publicRead(slug);
    if (!s) return null;
    const i = [...this.invitations.values()].find(
      (i) =>
        i.weddingId.equals(s.wedding._id) &&
        i.tokenHash === tokenHash &&
        !i.archivedAt,
    );
    return i ? { ...s, invitation: clone(i) } : null;
  }
  async mutate(
    actor: AuthSnapshot,
    id: ObjectId,
    action: string,
    work: (c: InvitationContext) => InvitationRecord,
  ) {
    const prior = this.lock;
    let release = () => {};
    this.lock = new Promise<void>((r) => {
      release = r;
    });
    await prior;
    try {
      const user = this.website.auth.users.get(actor.user._id.toHexString());
      if (
        !user ||
        user.status !== 'active' ||
        user.sessionVersion !== actor.user.sessionVersion ||
        user.role !== actor.user.role ||
        !user.weddingId.equals(actor.user.weddingId)
      )
        throw new HttpError(401, 'SESSION_EXPIRED', 'Please sign in again.');
      const c = await this.read(actor.user.weddingId, id);
      if (!c) throw new HttpError(404, 'NOT_FOUND', 'Wedding not found.');
      const i = work(c);
      if (this.failAudit) throw new Error('Synthetic audit failure');
      this.invitations.set(id.toHexString(), clone(i));
      this.audits.push(action);
      return { ...c, invitation: clone(i) };
    } finally {
      release();
    }
  }
}
