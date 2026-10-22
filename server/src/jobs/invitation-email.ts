import { randomUUID } from 'node:crypto';
import { EmailFailure } from '../infrastructure/email.js';
import type { EmailVault } from '../infrastructure/email.js';
import {
  CampaignService,
  applyReceipt,
  contentFingerprint,
  retryWindow,
} from '../modules/campaigns/campaigns.service.js';
import type {
  CampaignTransport,
  DispatchRecord,
  CampaignUnit,
} from '../modules/campaigns/campaigns.types.js';
export class InvitationEmailWorker {
  private owner = randomUUID();
  private stopped = false;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSweep = 0;
  constructor(
    private service: CampaignService,
    private vault: EmailVault,
    private transport: CampaignTransport,
    private now = () => new Date(),
  ) {}
  private fenced(
    current: DispatchRecord | null,
    claim: DispatchRecord,
  ): current is DispatchRecord {
    return Boolean(
      current &&
      current.status === 'running' &&
      current.leaseOwner === claim.leaseOwner &&
      current.leaseVersion === claim.leaseVersion &&
      current.leaseUntil &&
      current.leaseUntil > this.now(),
    );
  }
  private terminal(
    j: DispatchRecord,
    status: DispatchRecord['status'],
    code: string | null,
  ) {
    j.status = status;
    j.errorCode = code;
    j.retryable = false;
    j.payload = null;
    j.leaseOwner = null;
    j.leaseUntil = null;
    j.updatedAt = this.now();
    j.revision++;
  }
  async once() {
    const store = this.service.store;
    if (!(await store.ready())) return;
    if (+this.now() - this.lastSweep >= 60000) {
      await store.sweep(this.now());
      this.lastSweep = +this.now();
    }
    const claim = await store.claim(this.owner, this.now());
    if (!claim) return;
    const prepared = await store.transaction(
      claim.weddingId,
      null,
      async (u) => {
        const j = await u.dispatch(claim._id);
        if (!this.fenced(j, claim)) return null;
        if (
          (j.firstAttemptAt &&
            +this.now() - +j.firstAttemptAt >= retryWindow) ||
          j.attempts > 8
        ) {
          this.terminal(j, 'unknown', 'RECONCILIATION_REQUIRED');
          await u.saveDispatch(j);
          return null;
        }
        const i = await u.invitation(j.invitationId);
        if (
          j.mode !== this.service.mode ||
          u.wedding.publicationStatus !== 'published' ||
          !i ||
          i.archivedAt ||
          i.revision !== j.invitationRevision ||
          contentFingerprint(i) !== j.fingerprint ||
          u.wedding.revision !== j.weddingRevision ||
          !j.payload
        ) {
          this.terminal(j, 'cancelled', 'MESSAGE_CHANGED');
          await u.saveDispatch(j);
          return null;
        }
        j.firstAttemptAt ??= this.now();
        await u.saveDispatch(j);
        return j;
      },
    );
    if (!prepared) return;
    try {
      let mail;
      try {
        mail = this.vault.open(prepared.payload!, String(prepared._id));
      } catch {
        throw new EmailFailure('PAYLOAD_UNAVAILABLE', true);
      }
      const receipt = await this.transport.sendWithReceipt(
        mail,
        prepared.idempotencyKey,
      );
      if (receipt.outcome === 'accepted' && !receipt.providerId)
        throw new EmailFailure('PROVIDER_INVALID_RESPONSE');
      await store.transaction(prepared.weddingId, null, async (u) => {
        const j = await u.dispatch(prepared._id);
        if (!this.fenced(j, prepared)) return;
        this.terminal(j, receipt.outcome, null);
        j.providerId = receipt.providerId;
        if (receipt.outcome === 'accepted') {
          j.delivery = 'accepted';
          for (const event of await u.receipts(receipt.providerId!))
            applyReceipt(j, event);
          await this.service.markSent(u, j);
        }
        await u.saveDispatch(j);
        await this.audit(u, j, 'invitation_email.completed');
      });
    } catch (error) {
      await store.transaction(prepared.weddingId, null, async (u) => {
        const j = await u.dispatch(prepared._id);
        if (!this.fenced(j, prepared)) return;
        const permanent = error instanceof EmailFailure && error.permanent;
        const code =
          error instanceof EmailFailure
            ? error.code
            : 'EMAIL_PROCESSING_FAILED';
        if (permanent) {
          j.status = 'failed';
          j.retryable = ['PROVIDER_REJECTED', 'RECIPIENT_NOT_ALLOWED'].includes(
            code,
          );
          if (!j.retryable) j.payload = null;
        } else if (j.attempts >= 8) {
          this.terminal(j, 'unknown', 'RECONCILIATION_REQUIRED');
          await u.saveDispatch(j);
          await this.audit(u, j, 'invitation_email.unknown');
          return;
        } else {
          j.status = 'queued';
          j.nextRunAt = new Date(
            +this.now() + Math.min(3600000, 30000 * 2 ** (j.attempts - 1)),
          );
        }
        j.errorCode = code;
        j.leaseOwner = null;
        j.leaseUntil = null;
        j.revision++;
        j.updatedAt = this.now();
        await u.saveDispatch(j);
        await this.audit(u, j, 'invitation_email.failed');
      });
    }
  }
  private async audit(u: CampaignUnit, j: DispatchRecord, action: string) {
    await u.audit(action, j._id, this.now(), 'invitation-email-worker');
  }
  start() {
    const tick = () => {
      if (this.stopped) return;
      this.running = this.once()
        .catch(() => {})
        .finally(() => {
          this.running = null;
          if (!this.stopped) {
            this.timer = setTimeout(tick, 2000);
            this.timer.unref();
          }
        });
    };
    tick();
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }
}
