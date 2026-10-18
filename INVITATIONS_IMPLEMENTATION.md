# M4A — Families, personal invitations and estimates

Implemented locally on 18 October 2026 after M3 commit `3c68675`. This is the manual-sharing slice of M4. Family email batches, automatic sending, provider delivery tracking and webhooks remain M4B work, with the policy decisions recorded in DEVELOPMENT_ROADMAP.md still pending. The deferred Low/P3 bugs in BUG_BACKLOG.md are unchanged.

## Team journey

Both Admin and Manager open `/invitations` from the workspace or dashboard. Add a family display name, private contact name, optional phone and at least one distinct active ceremony from the same wedding. Family records start Not sent. Search family/contact names literally, filter Sent status or selected ceremony, and load subsequent pages (20 default, maximum 100).

Publish the wedding website before sharing. Share invitation reconstructs the same encrypted personal link and supplies a message with selected active ceremony names, local dates/times, venue names and the wedding timezone. Copy message, Copy link and Open WhatsApp are explicit user actions. The application never sends WhatsApp messages or infers delivery. Mark Sent separately after sharing. Re-sharing neither creates a family nor changes its Sent timestamp.

Edit uses the revision loaded into the form. A failed/stale save retains the entries. Reload saved family explicitly discards edits and loads current data. Creating a family has no automatic retry/idempotency contract: after an uncertain create outcome, refresh/check the list before submitting it again. Distinct records may share a display name; names are not unique family identifiers.

Replacing a link requires confirmation and invalidates every previous copy without changing the family identity or Sent status. Archiving requires confirmation, removes the family from active lists/estimates and invalidates its link, while retaining the historical record and event references. There is no restore operation in this slice.

## Personal guest view

Links have the baseline shape `/w/:slug/invite/:token`. The client captures the capability in component memory and scrubs the address to `/w/:slug/invite`. Refreshing that scrubbed page requires reopening the original message link. The token is submitted only in the body of `POST /public/weddings/:slug/invitation-view`; it is never put in API query strings, browser storage or TanStack Query cache keys.

The published wedding, current invitation lookup hash and nonarchived family must match in the same database snapshot. Invalid, malformed, rotated, archived, unpublished and wrong-wedding links return generic 404 responses. No account or session is needed. The endpoint uses an IP rate counter (60 attempts per 15-minute window, through the existing auth limiter). Capability reads intentionally bypass cookie-write CSRF middleware; they confer no mutation permission.

The page starts with the family greeting and selected active ceremony dates, times, venues and public organiser contacts; the full schedule remains below with explicit “You're invited” labels. It renders the complete existing guest website. It does not expose contact name/phone, ownership IDs, Sent state, revisions, hashes or encrypted tokens. Invitation capabilities cannot grant management/private-gallery access. No RSVP, confirmed attendance or guest cap is added.

The page refreshes every 25 seconds while visible and on focus/visibility return. A confirmed 404 hides previously loaded family content; temporary network failures display stale-data feedback. Revocation prevents subsequent reads; it cannot erase information already viewed or downloaded. The page uses no-store/no-referrer and noindex controls. Built personal-link HTML is generic and contains no family or token metadata; normal wedding metadata stays on the public wedding route.

## Estimates and archived ceremonies

Estimates count active invitation records with Sent status, once per family record. Wedding range = Sent families × 2–3; per-ceremony ranges count Sent families whose selected IDs include that active ceremony. Never sum ceremony counts to produce a wedding total. Mark Not sent clears sentAt; repeating Mark Sent preserves the original timestamp. Archived families stop contributing; archived ceremonies leave active estimates and personal highlights.

Historical selected IDs survive ceremony archive. Team list/detail responses contain `archivedEventIds`, and the UI displays an invitation-content-changed notice. Contact-only API patches may preserve historical selections; explicitly changing the selection requires at least one current active ceremony. The UI editor requires removing archived selections before saving its full selection.

## Persistence, encryption and concurrency

Migration `004-family-invitations` creates strict invitation validators and indexes for unique lookup hashes, wedding-scoped pagination, Sent status and selected events. Validators require unique nonempty event selections, revision/token versions and matching sentStatus/sentAt. No TTL is attached: photo expiry never expires the website or invitation records. Metadata retention remains an operational decision before launch. Unexpected incompatible preexisting invitation records require explicit reconciliation; the migration does not rewrite them.

Raw tokens are random 32-byte hexadecimal capabilities. Store a SHA-256 lookup hash plus AES-256-GCM ciphertext, authenticated against wedding ID, invitation ID and token version. The key is outside MongoDB. General list/detail responses return neither ciphertext nor capability; explicit authorised share/rotate actions return share payloads. Database snapshots/backups alone cannot recover shareable links without the key.

- Configure `INVITATION_ENCRYPTION_KEY` as a stable 64-character lowercase hex secret independently of email encryption. Do not commit it.
- Development/test runtime creates an ignored private `server/.local/invitation-key` when configuration is absent (directory 0700, file 0600).
- Production does not generate a key; invitation management is unavailable until it is configured. Existing authentication/website features remain independent of email and invitation keys.
- Back up the key securely. Losing/replacing it prevents existing-link recovery, although already distributed valid links still resolve by hash. There is only key version 1; automatic key-ring rotation is not implemented. Reconcile key configuration or deliberately rotate affected invitations before re-sharing.

Mutations transactionally recheck active account/session version/role/wedding, write the invitation and append a safe audit entry. Any late failure rolls back the entire mutation. Audit entries contain IDs/action/request correlation, without family contact data or links. A parent wedding `invitationWriteVersion` write serializes selection checks with event archive/publication writes without changing the wedding editor's content revision. Competing family changes use their own If-Match revision and reject stale writes.

## API implementation notes

All routes below are relative to `/api/v1`. Management routes reuse authenticated CSRF/origin protections; both team roles are allowed. Data is wrapped in `{data,meta:{requestId}}`, with list cursor metadata and ETags on revisioned records.

| Route                                         | Behaviour                                                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| GET/POST `/invitations`                       | Paginated active families / create a family.                                                                                                 |
| GET/PATCH/DELETE `/invitations/:id`           | Safe detail / partial edit / archive. PATCH and DELETE require invitation If-Match.                                                          |
| POST `/invitations/:id/sent-status`           | `{sentStatus:"sent"                                                                                                                          | "not_sent"}` with invitation If-Match. |
| POST `/invitations/:id/share-link`            | `{url,message,whatsappUrl}`, no mutation/If-Match; website must be published.                                                                |
| POST `/invitations/:id/rotate-link`           | Requires invitation If-Match; returns safe updated record plus `share` with the new URL/message when published, or `share:null` while draft. |
| GET `/attendance-estimates`                   | `kind:"estimate"`, totalFamilies, sentFamilies, attendee range and active ceremony ranges/names.                                             |
| POST `/public/weddings/:slug/invitation-view` | `{token}` → familyDisplayName, selectedEventIds and safe full guest model.                                                                   |

Normal list/detail records include id, names, private phone, selected IDs, archivedEventIds, revision, Sent state/timestamps and creation/update timestamps. Archived records are not exposed as active details. Missing If-Match returns 428; stale returns 412; invalid active ceremony selection returns 422. Literal search is bounded to 100 characters and escaped before Mongo regex matching. Opaque timestamp/ID cursors are bound to wedding, filters and page size; changed filters/scopes reject a cursor. Pagination is stable by createdAt then ID, descending.

## Verification and operating handoff

See PROJECT_STATUS.md for commands actually run and current outcomes. New checks cover contracts/encryption, HTTP permissions/revisions/filters/estimates/link lifecycle, Atlas validators/transactions/archive races, client failed-save and capability handling, and a real browser sharing journey. An in-memory substitute does not establish MongoDB transaction semantics; those require the separate Atlas suite.

Apply migrations explicitly using root `npm run db:migrate` in the intended environment after reviewing existing data and configuration. Tests use guarded temporary databases and synthetic data. After successful acceptance and an explicit target check, migration 004 was separately applied to development without seeding business records; production migration remains an operator action. No real WhatsApp/email dispatch, production deployment or owner data population is part of this implementation.

Next: owner QA of M4A and production prerequisites, then agree M4B batch initiation, Sent/delivery semantics and resend allowance before enabling family email dispatch.
