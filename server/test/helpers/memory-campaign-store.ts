import type { ObjectId } from 'mongodb';
import type { AuthSnapshot } from '../../src/modules/auth/auth.types.js';
import type {
  CampaignStore,
  CampaignUnit,
  BatchRecord,
  DispatchRecord,
  QuotaRecord,
  DeliveryReceipt,
} from '../../src/modules/campaigns/campaigns.types.js';
import { HttpError } from '../../src/middleware/errors.js';
import { clone } from './memory-website-store.js';
import type { MemoryInvitationStore } from './memory-invitation-store.js';
export class MemoryCampaignStore implements CampaignStore {
  migrated = true;
  failAudit = false;
  batchesMap = new Map<string, BatchRecord>();
  jobs = new Map<string, DispatchRecord>();
  quotas = new Map<string, QuotaRecord>();
  receiptsMap = new Map<string, DeliveryReceipt>();
  audits: string[] = [];
  private lock: Promise<void> = Promise.resolve();
  constructor(public invitations: MemoryInvitationStore) {}
  async ready() {
    return this.migrated;
  }
  async transaction<T>(
    weddingId: ObjectId,
    actor: AuthSnapshot | null,
    work: (u: CampaignUnit) => Promise<T>,
  ) {
    const prior = this.lock;
    let release = () => {};
    this.lock = new Promise<void>((r) => {
      release = r;
    });
    await prior;
    try {
      if (actor) {
        const user = this.invitations.website.auth.users.get(
          String(actor.user._id),
        );
        if (
          !user ||
          !user.weddingId.equals(weddingId) ||
          user.status !== 'active' ||
          user.role !== actor.user.role ||
          user.sessionVersion !== actor.user.sessionVersion
        )
          throw new HttpError(401, 'SESSION_EXPIRED', 'Please sign in again.');
      }
      const snapshot = await this.invitations.website.read(weddingId);
      if (!snapshot)
        throw new HttpError(404, 'NOT_FOUND', 'Wedding not found.');
      const inv = clone([...this.invitations.invitations.values()]),
        batches = clone([...this.batchesMap.values()]),
        jobs = clone([...this.jobs.values()]),
        quotas = clone([...this.quotas.values()]);
      const map = <T extends { _id: unknown }>(values: T[], record: T) => {
        const i = values.findIndex((v) => String(v._id) === String(record._id));
        if (i < 0) values.push(record);
        else values[i] = record;
      };
      const audit: string[] = [];
      const scoped = <T extends { weddingId: ObjectId; _id: ObjectId }>(
        v: T[],
        id: ObjectId,
      ) =>
        v.find((i) => i._id.equals(id) && i.weddingId.equals(weddingId)) ??
        null;
      const u: CampaignUnit = {
        ...snapshot,
        invitation: async (id) => scoped(inv, id),
        saveInvitation: async (i) => {
          map(inv, i);
        },
        batch: async (id) => scoped(batches, id),
        saveBatch: async (b) => {
          map(batches, b);
        },
        dispatch: async (id) => scoped(jobs, id),
        saveDispatch: async (j) => {
          map(jobs, j);
        },
        dispatches: async (id) =>
          jobs.filter(
            (j) => j.weddingId.equals(weddingId) && j.batchId.equals(id),
          ),
        quota: async () => quotas.find((q) => q._id.equals(weddingId)) ?? null,
        saveQuota: async (q) => {
          map(quotas, q);
        },
        receipts: async (id) =>
          clone(
            [...this.receiptsMap.values()].filter((r) => r.providerId === id),
          ),
        audit: async (action) => {
          if (this.failAudit) throw new Error('Synthetic audit failure');
          audit.push(action);
        },
      };
      const result = await work(u);
      this.invitations.invitations = new Map(
        inv.map((i) => [String(i._id), clone(i)]),
      );
      this.batchesMap = new Map(batches.map((i) => [String(i._id), clone(i)]));
      this.jobs = new Map(jobs.map((i) => [String(i._id), clone(i)]));
      this.quotas = new Map(quotas.map((i) => [String(i._id), clone(i)]));
      this.audits.push(...audit);
      return clone(result);
    } finally {
      release();
    }
  }
  async batches(weddingId: ObjectId, after?: ObjectId) {
    return clone(
      [...this.batchesMap.values()]
        .filter(
          (b) =>
            b.weddingId.equals(weddingId) &&
            (!after || String(b._id) < String(after)),
        )
        .sort((a, b) => String(b._id).localeCompare(String(a._id)))
        .slice(0, 21),
    );
  }
  async dispatches(weddingId: ObjectId, batchId: ObjectId) {
    return clone(
      [...this.jobs.values()].filter(
        (j) => j.weddingId.equals(weddingId) && j.batchId.equals(batchId),
      ),
    );
  }
  async claim(owner: string, now: Date) {
    const j = [...this.jobs.values()].find(
      (j) =>
        (j.status === 'queued' && j.nextRunAt <= now) ||
        (j.status === 'running' && j.leaseUntil && j.leaseUntil <= now),
    );
    if (!j) return null;
    j.status = 'running';
    j.leaseOwner = owner;
    j.leaseVersion++;
    j.leaseUntil = new Date(+now + 60000);
    j.attempts++;
    j.revision++;
    return clone(j);
  }
  async webhook(
    receipt: DeliveryReceipt,
    apply: (job: DispatchRecord) => void,
  ) {
    if (this.receiptsMap.has(receipt._id)) return;
    this.receiptsMap.set(receipt._id, clone(receipt));
    const j = [...this.jobs.values()].find(
      (j) => j.providerId === receipt.providerId,
    );
    if (j) apply(j);
  }
  async sweep(now: Date) {
    for (const b of this.batchesMap.values())
      if (b.status === 'preview' && b.expiresAt <= now)
        for (const item of b.items) item.payload = null;
    for (const j of this.jobs.values())
      if (
        j.status === 'failed' &&
        j.firstAttemptAt &&
        +j.firstAttemptAt <= +now - 23 * 3600000
      ) {
        j.payload = null;
        j.retryable = false;
      }
  }
}
