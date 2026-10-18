import { randomUUID } from 'node:crypto';
import type { AccessStore } from '../modules/access/access.types.js';
import type { EmailTransport, EmailVault } from '../infrastructure/email.js';
import { EmailFailure } from '../infrastructure/email.js';
export class AuthEmailWorker {
  private owner = randomUUID();
  private stopped = false;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private store: AccessStore,
    private vault: EmailVault,
    private transport: EmailTransport,
    private now: () => Date = () => new Date(),
  ) {}
  async once() {
    if (!(await this.store.ready())) return;
    const job = await this.store.claim(this.owner, this.now());
    if (!job) return;
    if (
      !job.payload ||
      job.expiresAt <= this.now() ||
      !(await this.store.validJob(job, this.now()))
    ) {
      await this.store.finish(job, this.now(), 'cancelled');
      return;
    }
    if (job.attempts > job.maxAttempts) {
      await this.store.fail(job, this.now(), 'RECONCILIATION_REQUIRED', true);
      return;
    }
    // Resend retains idempotency keys for 24 hours. Never retry an uncertain
    // external send after 23 hours; an operator must reconcile that outcome.
    if (
      job.firstAttemptAt &&
      this.now().getTime() - job.firstAttemptAt.getTime() >= 23 * 3600000
    ) {
      await this.store.fail(job, this.now(), 'RECONCILIATION_REQUIRED', true);
      return;
    }
    try {
      const mail = this.vault.open(job.payload, job._id.toHexString());
      const outcome = await this.transport.send(mail, job.idempotencyKey);
      await this.store.finish(job, this.now(), outcome);
    } catch (error) {
      await this.store.fail(
        job,
        this.now(),
        error instanceof EmailFailure ? error.code : 'EMAIL_PROCESSING_FAILED',
        error instanceof EmailFailure ? error.permanent : false,
      );
    }
  }
  start() {
    const tick = () => {
      if (this.stopped) return;
      this.running = this.once()
        .catch(() => {
          /* No provider diagnostics or links in logs. Retry on the next poll. */
        })
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
