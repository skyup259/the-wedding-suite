# Wedding Application — API Design

Version: 1.0  
Date: 15 October 2026  
Status: Version-one API contract for implementation  
Related: [PRD](./PRD.md), [System Architecture](./SYSTEM_ARCHITECTURE.md), [Database Design](./DATABASE_DESIGN.md)

This document specifies the REST API; it does not implement or deploy endpoints. Routes are relative to `/api/v1`. Browser pages such as `/w/avani-swar-14-02-2027` are frontend routes, not API endpoints.

## 1. Shared conventions

### Transport and access

- JSON over HTTPS, except direct S3 uploads/downloads. Same-origin browser requests use cookies.
- **A**: Admin only. **T**: authenticated Admin or Manager. **P**: public, published wedding. **G**: valid private-gallery session for that wedding. **U**: upload capability scoped to a single submission. **N**: unauthenticated authentication/setup flow.
- Management endpoints derive wedding identity from the logged-in account. Clients cannot choose or change their account's weddingId.
- Validate role, account state, expiry and wedding ownership for every operation. A record belonging to another wedding returns 404 rather than revealing its existence.
- Public/gallery/upload contexts never grant management permissions. A public endpoint returns public content even if the caller also has private-gallery access.
- Apply CSRF validation to cookie-authenticated writes. Return a CSRF token from `GET /auth/csrf`, including for pre-login flows; also validate request origin. Use appropriate rate limits for login, recovery, searches and uploads.
- Never log passwords, tokens, cookies, shared-link URLs or signed media URLs. Sensitive responses use `Cache-Control: no-store`.

### Data formats

| Type | API representation |
| --- | --- |
| IDs | Opaque strings; MongoDB ObjectIds serialised as strings |
| Instants | ISO 8601 UTC strings, e.g. `2027-02-14T12:30:00.000Z` |
| Calendar dates | `YYYY-MM-DD` in payloads; UI and wedding slug use `DD-MM-YYYY` |
| Timezone | IANA name, initially `Asia/Kolkata` |
| Money | Nonnegative integer paise encoded as decimal strings, e.g. `"8000000"` = ₹80,000 |
| Enums | Lowercase values defined below and in the database design |
| Nullable fields | Explicit `null` to clear an optional value in PATCH; omitted means unchanged |

Reject unknown write fields, invalid IDs, unsupported enum values and malformed dates. Server-generated fields such as totals, role, weddingId, object keys and reviewer identity cannot be client-assigned through ordinary resource updates.

### Response envelopes

```json
{
  "data": { "id": "resource-id", "revision": 3 },
  "meta": { "requestId": "request-id" }
}
```

Lists use `data: []` and `meta: {requestId, nextCursor, hasMore}`. Default limit 20, maximum 100; gallery default 30. Cursor is opaque and bound to the current filters/sort. Stable sort uses timestamp and ID. A vendor provider cursor may expire and is treated separately.

Create: 201. Read/update: 200. Asynchronous processing: 202 with a status resource. Successful synchronous delete/logout: 204 with no body. Invalid input: 422; malformed JSON: 400.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the highlighted fields.",
    "fields": [{ "path": "startAt", "code": "INVALID_DATE", "message": "Enter a valid time." }]
  },
  "meta": { "requestId": "request-id" }
}
```

### Concurrency and retries

- Mutable resource responses include revision and `ETag: "<revision>"`. PATCH/DELETE and resource state-change actions require `If-Match` against that resource, except explicitly idempotent capability exchanges and the auth register/login/logout actions, which do not mutate revision-controlled business resources.
- Missing precondition: 428 `PRECONDITION_REQUIRED`; stale revision: 412 `REVISION_CONFLICT`. Return current revision only for authorised resources.
- POST payment entries, upload submissions, upload slots and exports require `Idempotency-Key`. Scope keys by wedding/capability, route and logical operation. Same key/body returns the original operation; same key with different payload returns 409 `IDEMPOTENCY_CONFLICT`.
- Idempotency replay is checked after current authorisation but before rejecting the original stale revision. Repeated payment requests do not append another payment. Replayed upload responses may issue fresh credentials for the same unfinished slot; never create duplicate photos.
- A failed asynchronous operation is retried explicitly against its existing resource when possible, not by blindly creating new records.

## 2. Authentication and initial wedding creation

| Method and route | Access | Request / result |
| --- | --- | --- |
| GET `/auth/csrf` | N/T | CSRF token; establishes pre-auth context if needed |
| POST `/auth/register` | N | Admin identity + wedding setup; 201 and login cookie |
| POST `/auth/login` | N | email, password; 200 user and wedding summary + cookie |
| GET `/auth/me` | T | Current user, role, wedding summary |
| POST `/auth/logout` | T | Revoke session and clear cookie; 204 |
| POST `/auth/password-reset/request` | N | email; generic 202 response regardless of account existence |
| POST `/auth/password-reset/confirm` | N | token, newPassword; 204, consumes token and invalidates sessions |
| POST `/auth/manager-invitations/accept` | N | token, displayName, password; 201 Manager and cookie |

Registration payload:

```json
{
  "email": "couple@example.com",
  "password": "user-supplied-password",
  "displayName": "Avani",
  "wedding": {
    "couple": { "partner1Name": "Avani", "partner2Name": "Swar" },
    "mainDate": "2027-02-14",
    "timezone": "Asia/Kolkata",
    "themeId": "traditional"
  }
}
```

Create the wedding and Admin atomically. Generate slug `avani-swar-14-02-2027`, adding a short unique suffix on collision. Registration never creates a second wedding for an existing account. Reject authenticated attempts to register another wedding with 409 `ACCOUNT_ALREADY_ASSIGNED`. Login failures use a generic 401 `INVALID_CREDENTIALS`.

Setup/reset token expiry is checked before atomically consuming it. Reject cross-wedding Manager acceptance with 409 `ACCOUNT_ALREADY_ASSIGNED`. Token expiry and password policy values remain implementation configuration, reported through appropriate validation errors.

### Implemented authentication defaults — 18 October 2026

The initial csrf/register/login/me/logout slice is implemented. Manager invitations and password recovery are now implemented as M2; see TEAM_RECOVERY.md for setup and live-verification limits. Shared executable schemas are exported through `@wedding-suite/shared/auth`.

- Registration is strict: reject unknown fields including client-supplied role/wedding ownership. Names are trimmed, required, at most 100 characters. Emails are trimmed/lowercased, valid and at most 254 characters; dots/plus tags are preserved. Passwords are 15–128 characters without trimming or composition rules. Login accepts any nonempty password up to 128 characters. Main date is a valid calendar date; timezone must be recognised by the runtime. Theme IDs remain traditional/floral/minimal; the current signup UI defaults to traditional.
- Register (201), login (200) and me (200) return `{data: {user: {id, displayName, email, role}, wedding: {id, couple, mainDate, timezone, slug, publicationStatus, themeId}}, meta: {requestId}}`. ObjectIds are strings. No password/session hash or raw session token appears in JSON. Register persists a draft wedding/Admin/session/audit record atomically before issuing a cookie. Duplicate email returns 409 `EMAIL_ALREADY_REGISTERED`; invalid fields return 422 `VALIDATION_ERROR` with field paths.
- Sessions have a 24-hour absolute lifetime by default, configurable with `SESSION_TTL_SECONDS` (300–604800 seconds). Login rotates/revokes the previous browser session. Me checks expiry, revocation, active account state, sessionVersion and wedding membership, independent of TTL cleanup. Missing access returns 401 `AUTH_REQUIRED`; an invalid presented session returns `SESSION_EXPIRED`. Expired/missing logout returns 401 and clears cookies; successful logout returns 204 and revokes the current session only.
- `GET /auth/csrf` returns `{data: {csrfToken}, meta: {requestId}}`. Pre-auth context is a random HttpOnly context cookie, not a user/session database row. All three POST actions require `X-CSRF-Token` and an allowed Origin. Signed double-submit CSRF is bound to that context or the authenticated session hash. Issue/clear operations discard old CSRF context. Session/context cookies use SameSite=Lax; CSRF cookie uses Strict. All are HttpOnly, Path=/ and host-only, with Secure and `__Host-` names in production (`ws_session`, `ws_context`, `ws_csrf` locally).
- Production Origin must equal `APP_ORIGIN`; HTTP development accepts its localhost/127.0.0.1 alias at the same port. CSRF establishment rejects cross-site Fetch Metadata. CSRF errors are 403 `CSRF_FAILED`. Production requires a stable private `CSRF_SECRET` of at least 32 characters.
- Fixed-window MongoDB-backed rate limits per 15 minutes: register 5/IP, login 30/IP plus 10/normalised email, CSRF 120/IP. Failed attempts count. Excess returns 429 `RATE_LIMITED` plus `Retry-After`; limits aggregate across server instances. Configure trusted proxies accurately before deployment.
- API responses are no-store. Auth routes fail closed with 503 `SERVICE_UNAVAILABLE` until the explicit auth migration exists. Unknown API routes stay JSON errors; frontend-only navigation receives the React shell. M2 recovery/email details follow below and in TEAM_RECOVERY.md.

## 3. Team management

| Method and route | Access | Contract |
| --- | --- | --- |
| GET `/team` | T | Team IDs/names/roles/status for task assignment; email visible only to Admin |
| POST `/team/invitations` | A | `{email, displayName?}`; 201 invitation ID/state; enqueue/send setup email |
| GET `/team/invitations` | A | Pending/expired/used invitation summaries, no tokens |
| POST `/team/invitations/:id/resend` | A | Replace unused token, send again; 202 |
| DELETE `/team/invitations/:id` | A | Revoke unused invitation; 204 |
| PATCH `/team/:userId` | A | `{status: "active" | "disabled"}`; 200 updated Manager |

Team invitation responses expose a revision for conditional resend/revoke. Disabled Managers lose existing session access. The sole Admin cannot be disabled through this interface. Role transfer and multi-Admin management are outside version one.

### M2 implementation contract — 18 October 2026

- Team/recovery requires migration `002-team-recovery` and enabled email. Disabled email or an unapplied migration returns 503. Team reads derive wedding scope exclusively from the authenticated account. Admin mutation authority is checked again inside the transaction.
- Invitations default to 48 hours; password reset defaults to one hour. Both are random 32-byte lowercase hex tokens, accepted only in API request bodies. Browser email links use `/accept-invitation#token=…` or `/reset-password#token=…`; the fragment is scrubbed after reading and is not persisted in browser storage. Reopen the original link after refreshing its scrubbed page.
- Reset request returns 202 `{message}` identically for active/disabled/unknown emails. New requests invalidate prior reset links. Confirm returns 204, changes the password once, revokes all target-account sessions and clears the current browser session. Manager acceptance returns the existing safe identity envelope with a new cookie (201). Existing accounts cannot be moved/reassigned by invitation. Invalid/used/replaced/revoked links return 400 `INVALID_SETUP_LINK`; a retained expired token returns 410 `SETUP_LINK_EXPIRED`.
- Rate limits per 15 minutes: reset request 10/IP and 3/normalised email; reset confirm 20/IP; Manager accept 20/IP; Admin invite and resend each 20/Admin. All use the existing shared MongoDB counters. Public request limits apply equally to unknown accounts.
- Team list items: `id, displayName, role, status, revision`, plus email only for Admin. Invitation list items: `id, email, displayName|null, status, expiresAt, revision, delivery`. No raw token, hash or encrypted message is returned. Lists support limit (20 default, 100 maximum), scope-bound cursor and `meta.nextCursor/hasMore`.
- Create invitation returns 201 `{id, revision, status:"pending", delivery:"queued"}`. An existing pending invitation returns 409 `INVITATION_EXISTS`; an existing account returns 409 `ACCOUNT_ALREADY_ASSIGNED`. Resend returns 202 `{id,revision,delivery:"queued"}` and replaces the link. Revoke returns 204. Member PATCH returns the updated safe member. Mutation responses with a revision include ETag; resend/revoke/PATCH require `If-Match` (428 missing, 412 stale).
- Reset request/confirm and Manager accept are explicit exceptions to resource `If-Match`: they are pre-authentication/capability exchanges with transactional token consumption, not editable revision-controlled resources. Create invitation uses duplicate-conflict handling, not implicit email resend on retry.
- Invitation status is pending/expired/used/revoked while its auth-token record is retained. The baseline expiry TTL eventually removes these summaries; they are not a permanent history archive. Delivery is queued/running/accepted/outbox/failed/cancelled. Accepted means provider acceptance only; outbox means a local message, never external dispatch.
- Only Admin controls access. Disable/re-enable increments the Manager’s session version, revokes old sessions/reset capabilities, and never restores an old session. The sole Admin cannot be disabled. Invitation mutations/acceptance/reset and status changes record transactional audit entries.


## 4. Wedding, website and dashboard

| Method and route | Access | Contract |
| --- | --- | --- |
| GET `/wedding` | T | Editable wedding configuration, revision, photo expiry; no secrets |
| PATCH `/wedding` | T | Couple names, mainDate, timezone, location, website theme/content/coverPhotoId |
| GET `/themes` | T | Three theme identifiers, labels, preview assets and allowed settings |
| GET `/wedding/preview` | T | Full unpublished guest-page model; no-store |
| POST `/wedding/publish` | T | Validate public fields, publish and freeze slug; 200 |
| POST `/wedding/unpublish` | T | Hide public website and guest media access; 200 |
| GET `/dashboard` | T | Current/next events, task counts, estimate, pending photos, expense summary, expiry |
| PUT `/wedding/announcement` | T | `{message}`; uses wedding If-Match, returns updated wedding revision |
| DELETE `/wedding/announcement` | T | Clear announcement using wedding revision; 204 |

PATCH never permits direct edits to slug, role, private-link secrets or calculated expiry. A published slug stays stable after date edits. Date/timezone changes recalculate retention; reject a date extension during irreversible cleanup with 409 `MEDIA_CLEANUP_IN_PROGRESS`. Already deleted photos are never restored.

Only use a ready, approved, public cover photo from the current wedding; return a theme fallback after expiry. Before publication, validate required couple/theme/date and event contact information. Concurrent preview changes are guarded by revision.

## 5. Events and streaming

| Method and route | Access | Contract |
| --- | --- | --- |
| GET `/events` | T | Active events, chronological; `includeArchived=true` optional |
| POST `/events` | T | Event input; 201 |
| GET `/events/:id` | T | Event details/revision |
| PATCH `/events/:id` | T | Allowed event fields, status, sortOrder or stream |
| DELETE `/events/:id` | T | Archive; requires `?confirmReferenced=true` if invitations/tasks/photos/expenses reference it |

Event input:

```json
{
  "name": "Mehendi",
  "description": "Join us for the celebration.",
  "startAt": "2027-02-13T10:30:00.000Z",
  "endAt": null,
  "venue": { "name": "Garden venue", "address": "Venue address", "mapUrl": "https://maps.google.com/" },
  "contacts": [{ "name": "Family contact", "phone": "+919000000000" }],
  "dressCode": "Festive",
  "instructions": "Please arrive a little early.",
  "status": "not_started",
  "sortOrder": 1,
  "stream": null
}
```

Statuses: not_started/in_progress/completed, always explicitly set by the team. `stream` accepts a validated YouTube URL and enabled boolean. Archiving returns 409 `RESOURCE_REFERENCED` with permitted reference counts until confirmed; never cascade-delete historical records. Guest schedules exclude archived events, and personal invitations omit archived event highlights. Return a notice to the team that invitation content changed.

## 6. Families, invitations and estimates

| Method and route | Access | Contract |
| --- | --- | --- |
| GET `/invitations` | T | Filters `sentStatus`, `eventId`, `search`, cursor |
| POST `/invitations` | T | familyDisplayName, contactName, optional phone, eventIds; 201 |
| GET `/invitations/:id` | T | Family/event details and revision; no token |
| PATCH `/invitations/:id` | T | Contact/name/event selection |
| POST `/invitations/:id/sent-status` | T | `{sentStatus: "sent" | "not_sent"}`; timestamp maintained by server |
| POST `/invitations/:id/share-link` | T | Existing URL and WhatsApp message; no-store, no mutation and no If-Match required |
| POST `/invitations/:id/rotate-link` | T | Replace token, increment revision; new URL |
| DELETE `/invitations/:id` | T | Archive and invalidate link; 204 |
| GET `/attendance-estimates` | T | Unique sent-family count, 2–3 multiplier range, per-event ranges |

Share-link responses contain `{url, message, whatsappUrl}` with invited event dates/times and the invitation link. They do not send messages or mark invitations sent. Re-sharing never creates another family record.

Estimate response data example:

```json
{
  "kind": "estimate",
  "sentFamilies": 10,
  "attendees": { "min": 20, "max": 30 },
  "events": [{ "eventId": "event-id", "sentFamilies": 6, "min": 12, "max": 18 }]
}
```

No RSVP or guest-cap endpoint exists in version one.

## 7. Tasks

| Method and route | Access | Contract |
| --- | --- | --- |
| GET `/tasks` | T | Filters eventId/general, assigneeId, status, overdue, cursor |
| POST `/tasks` | T | title, description?, eventId/null, assigneeId/null, dueDate/null, status; 201 |
| GET `/tasks/:id` | T | Task/revision |
| PATCH `/tasks/:id` | T | Same editable fields; server derives completedAt |
| DELETE `/tasks/:id` | T | Archive; 204 |

Status: todo/in_progress/done. Due date is a calendar date in the wedding timezone. Null event means General. Validate active same-wedding assignees; either team role can edit any task. Overdue is computed, not client-editable.

## 8. Expenses and payments

| Method and route | Access | Contract |
| --- | --- | --- |
| GET `/expenses` | T | Filters eventId/shared, category, payerUserId or payerName, cursor |
| POST `/expenses` | T | description, category, eventId/null, vendorName?, notes?, costPaise; 201 |
| GET `/expenses/summary` | T | Cost/paid/outstanding/overpaid totals for event/category filters |
| GET `/expenses/:id` | T | Expense, payments, derived balances, revision |
| PATCH `/expenses/:id` | T | Expense fields, not embedded payments directly |
| DELETE `/expenses/:id` | T | Archive expense and exclude from active totals; 204 |
| POST `/expenses/:id/payments` | T | Payment input; Idempotency-Key + expense If-Match; 201 |
| PATCH `/expenses/:id/payments/:paymentId` | T | Payment edits; expense If-Match |
| DELETE `/expenses/:id/payments/:paymentId` | T | Remove payment with audit record; expense If-Match; 204 |
| GET `/expense-payments` | T | Flattened payments with payer/event/category filters and totalPaidPaise |

Payment input example:

```json
{
  "amountPaise": "2000000",
  "paidByName": "Avani",
  "paidByUserId": null,
  "paymentDate": "2027-02-01",
  "method": "bank_transfer",
  "notes": "Photographer advance"
}
```

Currency is INR. Responses include costPaise, paidPaise, outstandingPaise and overpaidPaise as strings. Overpayment is explicit, with an `OVERPAYMENT_RECORDED` informational warning; it requires no approval and does not offset another expense's outstanding balance. Positive payment values and valid monetary precision remain required.

Payer filters on expense lists mean “expenses this payer contributed to.” `/expense-payments` measures the actual amount that payer paid. Keep those meanings distinct in UI and totals. All payment modifications advance the parent expense revision.

## 9. Public wedding and invitation reads

| Method and route | Access | Contract |
| --- | --- | --- |
| GET `/public/weddings/:slug` | P | Names, theme/content, timezone, public cover, publication-safe settings |
| GET `/public/weddings/:slug/events` | P | All active events, contacts, stream information |
| GET `/public/weddings/:slug/today` | P | In-progress events, next event, announcement, updatedAt |
| POST `/public/weddings/:slug/invitation-view` | P + invitation token | Body `{token}`; invited family greeting, selected events and full schedule |
| GET `/public/weddings/:slug/photos` | P | Approved public photo metadata; filters eventId/general, source, submissionId |
| POST `/public/weddings/:slug/photos/:id/view-url` | P | Short-lived URLs for permitted thumbnail/original |

The frontend obtains the token from its personal link and submits it in the body; no token in API query strings. Suppress access logging of token-bearing page paths and use no-store/no-referrer controls. Invalid/archived invitation tokens return generic 404; do not return the family contact phone/email through this guest endpoint.

Photo lists return id, event, uploader display label, submission grouping, source, dimensions and count of visible photos. They never expose raw object keys, hidden-photo counts or management identities. Public photo access stays public-only even with a private cookie.

## 10. Private gallery access

| Method and route | Access | Contract |
| --- | --- | --- |
| POST `/wedding/private-gallery/share-link` | T | Existing private URL, or 409 if disabled; no-store, no revision required |
| POST `/wedding/private-gallery/rotate-link` | T | Enable and replace token/version; wedding If-Match; new URL |
| PATCH `/wedding/private-gallery` | T | `{enabled: false}`; wedding If-Match; revoke existing access |
| POST `/public/weddings/:slug/gallery-access` | P + private token | `{token}`; sets scoped HttpOnly gallery cookie, 200 expiry summary |
| DELETE `/public/weddings/:slug/gallery-access` | G | Clear that gallery session; 204 |
| GET `/public/weddings/:slug/private-photos` | G | All approved public and family-only photos |
| POST `/public/weddings/:slug/private-photos/:id/view-url` | G | Temporary viewing access to approved photo |

Generate the first private link via rotate-link. Re-enabling after disablement creates a new generation/token, not reuse of the old one. Private viewer access grants neither moderation nor export permissions. Remove the raw token from the displayed browser URL after exchange where practical. Gallery session expiry is capped by photo expiry.

Every request checks link enabled state, generation, wedding publication and authoritative photoExpiryAt. Rotation revokes derived gallery sessions. Previously issued media URLs expire within at most five minutes and never beyond photoExpiryAt; downloaded copies remain outside application control.

## 11. Upload and photo processing

### Endpoint families

| Method and route | Access | Contract |
| --- | --- | --- |
| POST `/public/weddings/:slug/photo-submissions` | P | uploaderDisplayName, defaultEventId/null; Idempotency-Key; 201 submission + upload capability |
| POST `/public/weddings/:slug/photo-submissions/:id/uploads` | U | files array; Idempotency-Key; issue slots and S3 instructions |
| POST `/public/weddings/:slug/photo-submissions/:id/uploads/:photoId/complete` | U | Notify completion; verify storage; 202 photo processing state |
| GET `/public/weddings/:slug/photo-submissions/:id/status` | U | Per-file upload/processing/approval state; no unapproved image URLs |
| POST `/public/weddings/:slug/photo-submissions/:id/uploads/:photoId/retry` | U | Renew failed/uncompleted slot safely; 200 instructions or 202 processing |
| POST `/photo-submissions` | T | Same submission flow; source=team derived from session |
| POST `/photo-submissions/:id/uploads` | T | Team upload slots; same ownership/limits |
| POST `/photo-submissions/:id/uploads/:photoId/complete` | T | Complete team upload; 202 |
| GET `/photo-submissions/:id/status` | T | Team submission status |
| POST `/photo-submissions/:id/uploads/:photoId/retry` | T | Retry existing team slot |

Upload capability is a short-lived random secret supplied in `X-Upload-Token`, stored as a hash with expiry on the submission. It permits only upload-slot completion/status/retry for that batch. It cannot list other submissions, change audience/moderation, or view pending images. Redact it from all logs. Reusing a submission idempotency key must not disclose/reissue its capability to a caller without the original capability or originating upload-session proof; otherwise return a safe conflict and permit a new batch.

Upload-slot request example:

```json
{
  "files": [{
    "clientUploadKey": "client-generated-unique-key",
    "fileName": "mehendi.jpg",
    "contentType": "image/jpeg",
    "sizeBytes": 2400000,
    "eventId": "event-id"
  }]
}
```

Response data contains `{photoId, upload: {method, url, fields, expiresAt}, processingStatus}` for each accepted file and indexed validation errors for rejected files. The client follows the returned S3 upload instructions; it never chooses storage keys. Limit responses to the configured batch size. All-rejected batches return 422; mixed batches return 200 with explicit per-file outcomes.

Proposed initial limits: 20 files/batch, 15 MB/file, JPEG/PNG/WebP; HEIC support is a remaining implementation decision. Return allowed limits/formats in submission response. Expected wedding volume of 200 photos is not a hard cap.

Complete does not trust client-reported content or grant approval: verify object ownership, actual size/type and process into immutable final keys. Guest photos start pending/family_only. Team slots may include an explicit audience; team approval becomes effective only after processing succeeds. Completion retries return the existing job/state and do not create new jobs.

No upload action succeeds after authoritative wedding photo expiry. Disabling uploads prevents guest slot creation and renewed upload credentials; any staging bytes already uploaded remain private and are cleaned up if not accepted.

## 12. Team photo management and exports

| Method and route | Access | Contract |
| --- | --- | --- |
| GET `/photos` | T | Filters processingStatus, moderationStatus, audience, eventId/general, source, cursor |
| GET `/photos/:id` | T | Metadata and revision |
| POST `/photos/:id/view-url` | T | Permitted processed preview/original, including pending/rejected, before expiry |
| POST `/photos/moderation` | T | Batch items with id, expectedRevision, decision and audience on approval |
| PATCH `/photos/:id` | T | audience and/or eventId; If-Match; cannot bypass processing/moderation |
| DELETE `/photos/:id` | T | Mark unavailable and enqueue physical deletion; 202 |
| PATCH `/wedding/photo-settings` | T | `{uploadsEnabled}`; wedding If-Match |
| POST `/photo-exports` | T | `{scope: "public_approved" | "all_approved"}`; Idempotency-Key; 202 |
| GET `/photo-exports/:id` | T | Export status, counts, expiry; no URL until ready |
| POST `/photo-exports/:id/download-url` | T | Fresh short-lived archive URL after access and expiry checks |

Moderation request:

```json
{
  "items": [
    { "id": "photo-1", "expectedRevision": 2, "decision": "approved", "audience": "public" },
    { "id": "photo-2", "expectedRevision": 1, "decision": "approved", "audience": "family_only" }
  ]
}
```

Limit moderation batches to 100. Each item is atomic; the batch is not all-or-nothing. Return 200 with `{results: [{id, success, revision?, error?}]}` so mixed conflicts are visible. Cross-wedding items return per-item NOT_FOUND. Unready photos cannot be approved; the reviewer is always the authenticated actor.

Gallery/media responses return 410 `PHOTO_ACCESS_EXPIRED` once photoExpiryAt is reached, including for team members. Metadata needed for cleanup status may remain available in the dashboard. Deletion response contains photoId and deletionState; poll GET /photos/:id. Lists immediately exclude deletion-requested records from viewer output.

## 13. Vendor discovery

`GET /vendors/search?query=wedding%20videographer&location=Jaipur&cursor=...` — T only.

Require a nonempty service query and either a manual location or explicit lat/lng coordinates. Never request browser location implicitly. The server constructs the Google Places request and supplies the API credential. Parameters include limit within provider constraints; provider cursors may be combined only with the original search parameters.

Response data: vendor `placeId`, name, supplied address, optional coordinates/contact/website, googleMapsUrl, and provider attributions. Include provider identity and next cursor in meta. Return only available fields; no fabricated ratings, distance or availability. An empty successful list differs from 502 `VENDOR_PROVIDER_UNAVAILABLE`. Quota exhaustion is 503 `VENDOR_SEARCH_UNAVAILABLE` with retry guidance where known. No endpoint creates a permanent copy of Google listings.

## 14. Errors and expiry semantics

| HTTP | Code | Meaning / client action |
| --- | --- | --- |
| 400 | BAD_REQUEST | Malformed payload/cursor |
| 401 | AUTH_REQUIRED / SESSION_EXPIRED | Sign in again |
| 401 | GALLERY_ACCESS_REQUIRED | Open a valid private link |
| 403 | FORBIDDEN / CSRF_FAILED | Role or request protection failed |
| 404 | NOT_FOUND | Missing, unpublished or cross-wedding resource |
| 409 | ACCOUNT_ALREADY_ASSIGNED | Account already belongs to a wedding |
| 409 | RESOURCE_REFERENCED | Explicit archive confirmation needed |
| 409 | IDEMPOTENCY_CONFLICT | Same retry key used for different operation |
| 409 | UPLOADS_CLOSED / INVALID_STATE | Operation incompatible with current state |
| 410 | PHOTO_ACCESS_EXPIRED | Gallery retention window ended |
| 410 | SETUP_LINK_EXPIRED | Setup/recovery link expired after valid token lookup |
| 412 | REVISION_CONFLICT | Reload/reconcile newer data |
| 413 | PAYLOAD_TOO_LARGE | Request or file exceeds limit |
| 415 | UNSUPPORTED_MEDIA_TYPE | Unsupported content/file type |
| 422 | VALIDATION_ERROR | Field-specific errors |
| 428 | PRECONDITION_REQUIRED | Supply current If-Match |
| 429 | RATE_LIMITED | Retry according to Retry-After |
| 502/503 | PROVIDER_UNAVAILABLE | Integration unavailable; retry safely |
| 500 | INTERNAL_ERROR | Generic message plus requestId; no stack trace |

Always authenticate/authorise before exposing private expiry or conflict details. Internal logs may include more diagnostic information without secrets. MongoDB TTL is never the source of API validity decisions.

## 15. Implementation and contract verification

- Add request/response schemas and generate an OpenAPI specification when implementing routes; this Markdown is the current contract.
- Store monetary fields as precise integers while consistently serialising them as strings.
- Test permissions for every endpoint with Admin, Manager, anonymous guest, private viewer and an account from another wedding.
- Verify management cookie and gallery/upload capabilities cannot be substituted for one another.
- Test request retries, stale revisions, partial batch failures and safe token rotation.
- Verify public projections and counts never leak family-only/pending photos or private invitation contact data.
- Test seven-day expiry boundaries and that signed media/export URL lifetime cannot extend past expiry.
- Test upload completion after network failure, duplicate completion, invalid file bytes and pending-job recovery.
- Test provider errors, empty vendor results, Manager setup and password recovery.
- Do not expose internal jobs, credentials, audit internals or arbitrary database filters as public endpoints.

The hosting provider, email provider, exact authentication lifetimes and final upload limits remain implementation configuration. No API implementation or external integration has been deployed by this document.


## M3 implementation notes — 18 October 2026

Wedding/events, three theme presentations, private preview/publication and anonymous wedding/events/today reads are implemented; consult WEBSITE_IMPLEMENTATION.md and PROJECT_STATUS.md for operating limits and actual acceptance. Shared executable schemas are exported at `@wedding-suite/shared/website`.

- Migration 003 is required. GET wedding includes editable fields, public state, revision, safe latest announcement, update time and calculated expiry; it never returns gallery secrets. Themes retain Traditional/Floral/Minimal identifiers and list their labels/descriptions; previews render the real current content, not remote preview assets.
- Public wedding and private preview return the same safe aggregate: `{wedding:{couple,mainDate,timezone,slug,website,latestAnnouncement},events,today,updatedAt}`. Public events/today also have their documented individual endpoints. The preview meta contains weddingRevision; publish must match it. Public events omit revisions/management identities, while private event responses include revision/archivedAt/update time.
- First publication and subsequent edits to published content require at least one complete active ceremony, each with venue name/address and one or two contacts. Preview is the UI entry point for publishing. Later saved edits are immediately public. Unpublish changes publication state without unlocking the address or deleting content.
- Event PATCH validates the merged complete event (including end after start), accepts partial allowed fields and rejects unknown ownership/revision fields. All mutable actions require If-Match; event POST is an explicit exception because there is no pre-existing event revision. Every event mutation also advances the parent wedding revision to guard concurrent publication/preview edits.
- The complete per-wedding ceremony schedule is returned in chronological order; array metadata declares nextCursor:null/hasMore:false. It is not truncated by the default pagination used for growing invitation/photo lists. includeArchived=true is available only to the team. Archive returns 204 and keeps history; referenced archive requires confirmReferenced=true and returns safe wedding-scoped counts on the initial 409.
- Streaming remains M7: stream currently accepts null only. Managed covers remain M6: coverPhotoId currently accepts null only and public responses always use a decorative fallback. No public gallery/media endpoint is enabled by this feature.
- Supported accents are the four dark palette values in shared schemas. Main date/timezone edits recalculate authoritative expiry/retention version; access-extending edits are blocked if cleanup may already have deleted media (running/complete/failed). Event instants remain unchanged when wedding timezone changes. Published slugs remain stable after date edits/unpublication.
- Guest pages poll every 25 seconds and refresh on visibility/focus return; failed refresh is explicitly shown. Public page/API responses are no-store, require published state and never include private team/family/gallery/expense data. Built HTML includes escaped per-wedding social metadata; Vite development uses client-side titles.


## M4A implementation notes — 18 October 2026

Manual family invitations and estimates are implemented; see INVITATIONS_IMPLEMENTATION.md for exact payloads, key setup and verification limits. Shared contracts are exported at `@wedding-suite/shared/invitations`. Both team roles manage family records. List/detail responses exclude token material; share-link is an authorised read action and never marks Sent. Rotation returns the safe updated record plus `share` (new URL/message when published, null while draft). Personal invitation responses contain familyDisplayName, selectedEventIds and the full safe guest `model`, without private contact data. Active lists include archivedEventIds to flag changed invitation content; estimates add totalFamilies and per-event names for the dashboard.

Invitation mutations require their own If-Match except creation and the nonmutating share-link action. Public invitation-view is a rate-limited anonymous capability read, intentionally outside cookie-write CSRF middleware; invalid capabilities and unpublished weddings return generic 404. Tokens are scrubbed from personal-page addresses after capture and submitted only in the API body. Selected events highlight content, never restrict the full schedule. Email batches, delivery tracking, scheduling, RSVP and guest caps are not enabled by this slice.


## M4B email batch contract — 19 October 2026

Family input/private responses now allow optional normalized email and expose emailQueued; public personal projections still omit contacts. POST /email-batches/preview accepts 1–25 distinct invitationIds; GET /email-batches and /email-batches/:id provide history/review/results; POST /email-batches/:id/confirm requires batch If-Match and is replay-safe after current authorization. POST /email-dispatches/:id/retry requires dispatch If-Match and reuses the reviewed recipient/message/key only; /reconcile verifies an entered provider UUID against exact stored hashes via provider lookup. Signed POST /webhooks/resend consumes raw bytes outside cookie CSRF. See EMAIL_INVITATIONS_IMPLEMENTATION.md for envelopes, states, errors and privacy limits.

Owner explicitly disabled new resends. First-confirmed reservations share a 25-new-family daily allowance, with timezone frozen from the wedding's first confirmed email batch to prevent timezone edits resetting quota. Acceptance can mark Sent while preserving intervening manual changes; delivery/bounce is separate. Outbox never marks Sent. Authentication/domain/delivery acceptance is pending; the current key's read-only check returned 401. No automatic scheduler, RSVP or delivery claim is added.
