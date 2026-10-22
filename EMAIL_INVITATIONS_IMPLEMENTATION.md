# M4B — Reviewed family email batches

Implemented locally on 19 October 2026 after M4A commit `8811aef`. See PROJECT_STATUS.md for actual check results and remaining provider acceptance. Owner decision: **explicit resends are disabled**; only safe retries of the original immutable dispatch are supported. No automatic daily scheduler, RSVP, read receipts or WhatsApp automation is added.

## Team workflow

1. In `/invitations`, add each family's optional contact email. It is trimmed, lowercased and validated; contact-only partial edits preserve omitted email.
2. Open `/invitations/email`, select up to 25 families and prepare a preview. Each selected family needs an email and at least one selected active ceremony; the website must be published. Both Admin and Manager may do this for their wedding.
3. Review every recipient, subject, message, mode and daily allowance. The preview contains selected local ceremony dates/times/venues and the existing personal link; it expires after 15 minutes. Previewing alone does not send, reserve allowance or mark Sent.
4. Confirm once. The whole batch validates current family/content versions, reserves allowance and creates individual encrypted jobs atomically. Repeating the same confirmation returns the existing batch after current authorisation, without reserving or creating jobs again.
5. Review per-family results. Mixed outcomes stay separate. Original retries preserve recipient, body and idempotency key. No action creates a second dispatch for a previously queued family.

Outbox mode creates private local test messages only and does not mark Sent. Live Resend mode marks a previously Not sent family Sent on provider acceptance if its revision is still the queued revision. An intervening team edit/status change/archive is preserved; the provider outcome is still recorded. Later delivery/bounce/complaint events do not inflate or reverse unique-family estimates. Accepted means provider acceptance, not recipient delivery or attendance confirmation.

## Sending policy and quota

The allowance is **25 new-family reservations per wedding per calendar day**, charged at confirmation, shared across all team members and channels of this email module. Failed/cancelled jobs do not refund slots; safe retries consume no additional slots. Manager setup and password recovery jobs do not consume this allowance. A reservation is not a guarantee that an email is sent on that same calendar day during provider outages.

The counter's timezone is taken from the wedding at its first confirmed email batch, then kept fixed for subsequent email days. This is explicitly shown in preview/results: editing the website timezone cannot reset the daily allowance. Event display still follows the wedding's current timezone. This email-counter choice extends the baseline deliberately; changing an established quota timezone requires operator reconciliation outside the UI. A backward counter date is rejected rather than reopening allowance.

Each family receives one individual email; no shared To/CC list is used. Identical display names are separate family identities as in M4A. `emailSequence` records the first queued dispatch even if it fails or is cancelled. Editing the email after a confirmed batch does not authorise another send. Such recipient/message corrections require a separately agreed future resend/replacement policy; the current UI offers safe original retries only.

## Persistence and lifecycle

Migration `005-invitation-email`:

- Extends invitations with optional email, internal emailSequence/emailLastQueuedAt and a safe emailQueued response flag.
- Adds `invitationEmailBatches` (review versions, encrypted preview items, expiry/status), `invitationEmailQuotas` (wedding counter/day/timezone), and `emailWebhookReceipts` (signed event ID, provider ID/type/time only), plus minimal `emailProviderFences` for receipt/binding coordination.
- Extends the jobs validator with a strict `invitation_email` variant; existing `auth_email` schema and claim filters remain separate. The shared worker infrastructure remains in the monolith.
- Adds uniqueness for each wedding/family/sequence and provider email ID, plus claim/batch/receipt indexes. Batch history uses wedding-scoped ID cursors, 20 default with no unbounded offset.
- Reconciles the audit contract: system entries keep actorId null, while user audit entries still require a real actor ID. Audits contain safe IDs/actions, never recipient lists, raw links or provider response bodies.

Confirmation rechecks active account, wedding, role and sessionVersion inside its transaction. It uses the existing parent wedding write fence to serialize with family edits and ceremony/publication changes. The wedding editor's content revision is not changed by internal quota/worker writes. Late failures roll back quota, jobs, family sequence and audit together.

Queued mail uses the existing AES-256-GCM EmailVault and a dispatch-ID context; keys remain outside MongoDB. Confirmation clears preview ciphertext after copying it to jobs. Worker cleanup clears expired preview messages and failed-job payloads after the retry window. Accepted/outbox/cancelled/unknown jobs clear their ciphertext immediately. The reviewed family display label and minimal message/recipient hashes remain for results and reconciliation. No TTL removes active jobs or idempotency history. Metadata/webhook retention policy and key backup/rotation remain production prerequisites; preview and failed-payload cleanup runs through the active worker, not TTL access control.

## Worker and delivery states

The family worker claims only invitation_email jobs with a 60-second lease and owner/version fencing. Provider requests have a 15-second timeout. It checks publication, mode, current family revision/fingerprint and wedding content revision before sending. Stale queued content is cancelled, not silently regenerated. An edit/revocation after an in-flight request starts cannot unsend it; the personal link still observes current publication/token validity.

Transient failures retry the same encrypted message and stable key with bounded exponential backoff (30 seconds initially, maximum one hour). At most eight attempts are made, and automatic/manual retries stop 23 hours after the first attempt. This leaves margin inside Resend's documented 24-hour idempotency window. Uncertain/exhausted sends become unknown and cannot be sent again automatically. A stale worker cannot commit after lease expiry/reclaim.

Statuses are queued/running/accepted/outbox/failed/cancelled/unknown. Delivery is separately pending/accepted/delayed/delivered/bounced/complained/failed. Permanent provider rejection may offer Retry original dispatch while still within the window and with unchanged content/mode; uncertainty never offers that retry. Batches expose all individual results rather than hiding mixed failures behind a single successful batch label.

For an unknown live dispatch, an authorised team member may enter its provider email ID for a read-only lookup. The server must verify exact recipient/message hashes and the allowed creation window before recording acceptance/delivery. A mismatched, reused or inaccessible provider ID changes nothing. No manual “assume delivered” control exists. The API key needs read permission for this lookup; a send-only key cannot reconcile through the application.

## Signed webhooks

`POST /api/v1/webhooks/resend` receives raw application/json before the ordinary JSON/CSRF middleware. Svix 2.8.0 verifies signed ID/timestamp/raw bytes and freshness before JSON parsing. The pinned verifier returns no parsed payload; parsing happens only after successful verification. The signing secret is separate from the API key.

Subscribe to email.sent, email.delivery_delayed, email.delivered, email.failed, email.bounced and email.complained. Signed duplicate IDs are acknowledged without another effect. A provider-ID write fence serializes receipt insertion with dispatch binding, including the case where a receipt arrives during the binding transaction. Receipts contain no recipient, subject or body; early receipts can be applied after the send response supplies its provider ID. Unknown provider IDs remain receipt metadata until a matching dispatch is accepted/reconciled. Out-of-order events cannot downgrade delivered to sent/delayed or undo a bounce/complaint. Webhooks never independently mark a family Sent after a later manual status change.

## API additions

All management routes are under `/api/v1`, use the session wedding and existing CSRF/origin protections, and return no-store envelopes. Preview returns reviewed plaintext only to the authorised team. General batch lists omit preview message/recipient material; normal family reads expose optional email/emailQueued but never token/ciphertext/internal sequence fields.

| Route                                  | Contract                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| POST `/email-batches/preview`          | `{invitationIds:[...]}` distinct 1–25; 201 reviewed batch, no sending.                                           |
| GET `/email-batches`                   | Cursor-paginated batch summaries and individual statuses.                                                        |
| GET `/email-batches/:id`               | Current batch/review or results. Expired review plaintext is unavailable.                                        |
| POST `/email-batches/:id/confirm`      | Empty body, batch If-Match; 202 atomic reservation/enqueue. Already-confirmed replay returns the original batch. |
| POST `/email-dispatches/:id/retry`     | Empty body, dispatch If-Match; 202 safe original retry only.                                                     |
| POST `/email-dispatches/:id/reconcile` | `{providerId:<UUID>}`, dispatch If-Match; exact provider verification for unknown live outcomes.                 |
| POST `/webhooks/resend`                | Signed provider delivery event; no team cookie/CSRF needed; 204 on accepted/duplicate events.                    |

Preview/confirm returns quota day/timezone/firstRemaining and the exact mode, so a team can distinguish outbox from live dispatch. Missing revision returns 428, stale revision 412; expired/changed preview, exhausted allowance, disabled resends and unsafe retry return explicit 409 errors. Wrong-wedding resources return 404. Payloads forbid client-controlled wedding IDs, retry keys, delivery claims and resend flags.

## Configuration and live acceptance

- RESEND_API_KEY and EMAIL_FROM are present in the owner's private configuration. A read-only `/domains` check on 19 October returned HTTP 401: authentication/domain readiness is **not verified**. No actual email was sent.
- A subsequent development preflight also rejected EMAIL_FROM as an invalid email address. Correct it privately to a valid sender address; no private configuration was overwritten. The additive schema migration can run with a temporary synthetic sender override and does not send mail.
- Current EMAIL_MODE is unset, so development remains private outbox. Adding an API key does not silently switch modes or send pending local messages through Resend.
- To enable controlled live testing later, privately set EMAIL_MODE=resend and EMAIL_ALLOWED_RECIPIENTS to explicitly approved test addresses. Non-production Resend mode refuses startup without an allowlist; any configured allowlist is also enforced in production. No addresses/credentials belong in this document.
- Configure the real webhook destination and RESEND_WEBHOOK_SECRET privately. Real inbound webhooks require a reachable HTTPS deployment; local signed tests do not establish provider delivery.
- Production requires the existing stable email/invitation encryption keys, HTTPS origin, cookie/proxy settings, migrations, backup and operational acceptance. The provider's domain/account quotas must also be checked separately.

Development and temporary tests use synthetic recipients/private outbox or mocked send/lookup APIs. Existing Manager setup/recovery adapter behaviour is preserved. Controlled real setup/recovery delivery, actual family delivery, live signature callbacks and production HTTPS acceptance remain pending until their configuration and recipient approvals are available.

Sources: [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests), [send API](https://resend.com/docs/api-reference/emails/send-email), [retrieve API](https://resend.com/docs/api-reference/emails/retrieve-email). Verify current provider contracts before deployment.

## Manual QA checklist

- Add/edit optional family email; confirm omitted email survives a contact-only edit and public family pages contain no contact email.
- Publish the wedding and select eligible families. Review recipients, selected ceremonies, messages, mode and allowance before confirming; preview alone must not change Sent or allowance.
- Confirm an outbox batch once, reload its history and verify per-family labels/results. Outbox must leave Sent/estimates unchanged and already queued families must be unavailable for another dispatch.
- Change a family or wedding after preview and verify confirmation rejects the stale review while preserving the selection. Prepare a fresh preview.
- Exercise Admin and Manager wedding isolation, concurrent allowance reservations, mixed failures, bounded original retries and unknown-outcome verification using controlled test fixtures. Do not send real messages without approved recipients and corrected provider configuration.
- Check narrow/mobile layout, keyboard selection, error messages and results refresh. Real delivery/bounce callbacks require separate controlled provider acceptance.
