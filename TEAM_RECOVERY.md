# Manager invitations and password recovery

Implemented: 18 October 2026 (Asia/Kolkata). Real Atlas integration/concurrency tests, both Atlas-backed browser journeys and the development migration passed after network access was repaired. Controlled live Resend delivery and production HTTPS acceptance remain pending. See PROJECT_STATUS.md for the checks actually completed.

## Behaviour

- `/team` lists the wedding’s team. Only Admin sees emails, invitations and access controls. Admin can invite, resend, revoke, disable and re-enable Managers. The sole Admin cannot be disabled. Disabling a Manager revokes their sessions and reset links; enabling never restores old sessions.
- A Manager follows `/accept-invitation#token=…`, enters a name and password, and joins only the inviting wedding. Acceptance atomically consumes the invitation, creates a Manager, records the audit entry and creates a session. An existing account cannot join again or be moved to another wedding. Signed-in users must sign out before accepting.
- `/forgot-password` always returns the same accepted message for active, disabled and unknown emails. A newer request replaces earlier reset links. `/reset-password#token=…` changes the password once, increments the session version and revokes existing sessions. It does not automatically sign in.
- Invitation links default to 48 hours and reset links to one hour. Expiry is checked in the transaction; asynchronous TTL cleanup never grants extra access. Invitation summaries are available only while their auth-token records remain; TTL eventually removes expired/used records. This follows the existing token-retention baseline, not a permanent invitation archive. Create a new invitation if its expired record has been cleaned up.
- Both lists are paginated (default 20, maximum 100), with wedding/list-bound cursors and Load more controls. Resend, revoke and member-state changes require the resource revision through `If-Match`; stale editors must refresh. A duplicate create returns a conflict rather than silently resending.

## Local setup and review

1. Keep the private development Atlas configuration in `server/.env`. Apply both migrations through root `npm run db:migrate` in each new environment; the development migration was applied successfully on 18 October 2026. Migrations never seed wedding/team data.
2. Run root `npm run dev`. Existing signup/login/logout remains available after its original migration. Team/recovery returns 503 until migration `002-team-recovery` exists and email is enabled.
3. Development defaults to `EMAIL_MODE=outbox`. The server persists its generated encryption key at ignored `server/.local/email-key` and writes private JSON messages to `server/.local/outbox/` (directory mode 0700; files mode 0600). No external email is sent. Open the message privately in an editor to follow its link; never paste the message or its token into logs, issues or progress notes. Remove local outbox messages after reviewing them.
4. As Admin, open **Manage wedding team**, invite a synthetic Manager, then follow its outbox link in another browser profile. Check Manager permissions, resend/revoke and disablement. Use **Forgot your password?** on login to exercise recovery. Refreshing a link page after its fragment was scrubbed requires reopening the original email link; tokens are intentionally not persisted in browser storage.

## Resend configuration

Use `EMAIL_MODE=resend`, a private `RESEND_API_KEY`, `EMAIL_FROM` as a plain email address on a verified sending domain, and a stable private `EMAIL_ENCRYPTION_KEY` containing 64 lowercase hex characters (32 bytes). Non-production also requires `EMAIL_ALLOWED_RECIPIENTS`, a comma-separated list of exact permitted addresses. Deliveries outside a configured list fail without calling Resend, including in production mode. For HTTPS staging, use the production runtime with a separate database/key/sender configuration and an explicit team-only recipient allowlist; also restrict staging access. Never copy unrestricted production recipient settings into staging.

Production defaults to disabled email; explicit `EMAIL_MODE=resend` enables these flows. Production rejects outbox mode and requires the stable encryption key. The existing production HTTPS/CSRF/proxy requirements still apply. No provider account, sender domain, credentials or production configuration has been provisioned by this implementation, and no real email was sent during development checks.

The worker sends plain-text templates using the Resend API and records **accepted by provider**, not delivery to an inbox. Bounces, delivery webhooks, family invitation campaigns and automatic daily batches are outside this milestone.

## Delivery and privacy contract

The original hash-only setup-token requirement and durable delivery need different storage: `authTokens` retains only SHA-256 token hashes. To allow a worker restart before dispatch, the queued email envelope is separately encrypted with AES-256-GCM in `jobs`, authenticated against its job ID. No setup/reset token is recoverable through an API or a re-share action. The encrypted envelope is cleared on terminal success/failure/cancellation. Private development outbox files deliberately contain the message for local review; they are never served by the application.

Only `auth_email` is enabled in the first jobs migration. Photo/export job types must extend the validator when their lifecycle is implemented. Workers claim atomically with a 60-second lease and increasing lease version, recheck lease/token validity before sending, and fence completion/failure by owner, version and unexpired lease. One worker processes bounded messages per monolith instance; another instance can recover abandoned leases. Shutdown stops claims and allows the bounded 15-second provider request to finish within a 25-second shutdown grace period.

Retries keep the identical recipient, message and provider idempotency key, with exponential backoff from 30 seconds and at most eight attempts. [Resend retains idempotency keys for 24 hours](https://resend.com/changelog/idempotency-keys); uncertain work older than 23 hours fails with `RECONCILIATION_REQUIRED` rather than risking a duplicate after that window. Worker attempts and errors use safe codes, without provider diagnostics or message content. A send already in flight when an invitation is revoked may still arrive, but its link cannot be used.

Before replacing `EMAIL_ENCRYPTION_KEY`, disable new account emails and drain/reconcile outstanding jobs under the old key. There is no automatic key-ring rotation. Do not remove the development key while messages are queued. Terminal job/audit metadata retention still needs an operating policy before production; no TTL is applied to live jobs. Token TTL remains anchored to token expiry, as in the database baseline; photo retention is unchanged.

## Verification commands

- `npm run check`: formatting, lint, type checks, credential-free tests and production build.
- `npm run test:integration`: real Atlas validators/indexes, concurrent token consumption, rollback, session revocation, wedding isolation and lease recovery in randomly named, guarded temporary databases. Never use production credentials.
- `npm run test:e2e`: built frontend plus real Atlas test persistence and a private temporary outbox; no external email.
- `npm run test:e2e:local`: the same browser journeys with explicit in-memory stores when Atlas is unavailable. This verifies forms, routing, HTTP flows and mobile rendering, not MongoDB transactions or real email delivery. Temporary synthetic outboxes are cleaned up by both server shutdown and awaited Playwright teardown.

Atlas checks and the development migration have passed. Complete controlled Resend staging delivery and the real HTTPS/session/proxy walkthrough before declaring M2 ready for production.
