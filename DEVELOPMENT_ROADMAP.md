# Development and deployment roadmap

Created: 18 October 2026 (Asia/Kolkata).  
Last reviewed: 22 October 2026 (Asia/Kolkata).

Status: M1–M4B and M5A expenses/payments are implemented locally. Atlas connectivity was restored and live ping/direct/proxied readiness verified on 22 October. Live email, staging and production acceptance remain pending. The ordered backlog below supersedes the original calendar targets and stale next-feature statements; those dates remain planning history, not commitments.

## Remaining work and recommended order — 22 October 2026

This inventory compares the PRD, architecture, database/API contracts, current source modules, implementation notes and bug register. It distinguishes missing functionality from implemented functionality awaiting external acceptance. Existing local changes are preserved; no new feature implementation is authorised by this planning update.

Already implemented: wedding/Admin signup; login/logout/session recovery; Manager invitation/access and password recovery; website settings, three themes, private preview and publication; ceremony editing/status and announcements; personal family invitations, manual sharing/Sent tracking and attendance estimates; reviewed email batches with daily reservations, safe original retries, callbacks and reconciliation. M4B is local work after the M4A checkpoint, with provider verification still pending. The dashboard currently shows wedding/account details and navigation, not operational task/expense/photo summaries.

| Order | Work package                                      | Remaining deliverables                                                                                                                                                                                                                                                                                                                                                                                                          | Completion gate / dependency                                                                                                                                                                                                            |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Restore development connectivity                  | Inspect current Atlas access, add only the current outbound IPv4 `/32` when authorised, restart the backend, check direct and frontend-proxied readiness. Plan stable application egress for hosting.                                                                                                                                                                                                                           | Live application ping and both readiness routes pass. A failed connection alone does not prove an IP mismatch.                                                                                                                          |
| 2     | Close invitation-release prerequisites            | Schedule BUG-005 uncertain-send reconciliation fix before real family sends; actionable provider-ID feedback (BUG-006); controlled Resend acceptance for Manager setup, recovery and family batches; signed callback/replay and unknown-outcome reconciliation checks against the real provider; verify reviewed daily quota behaviour.                                                                                         | Controlled provider operation and usable links, honest acceptance/delivery states, no duplicate sends. Existing outbox success is insufficient. Owner previously deferred bug fixes; this is a proposed order, not a fix performed now. |
| 3     | Establish staging and release operations          | Hosting/domain/budget selection; pinned Node/npm CI using root checks; isolated staging Atlas credentials/database, secret configuration and HTTPS; explicit migration/release/rollback procedure; secure cookies, CSRF and proxy checks; backup/restore rehearsal, health/job/error monitoring and terminal job/audit retention policy.                                                                                        | Reviewed staging walkthrough and invitation rehearsal before production family sends. Deployment remains owner-managed. Begin provisioning here so later features can be reviewed on staging.                                           |
| 4     | M5A — Expenses and payments (implemented locally) | Expense create/edit/archive; event/shared categories, vendor/notes; payment add/edit/remove, payer/date/method; exact integer-paise storage and string API amounts; total cost/paid/outstanding/overpaid; event/category/payer filters; audit, revisions and retry protection.                                                                                                                                                  | ₹80,000 less ₹20,000 and ₹30,000 gives ₹30,000 outstanding; concurrent/repeated requests and two-wedding isolation pass. No spending approval or budget enforcement.                                                                    |
| 5     | M5B — Preparation tasks and overview              | Task create/edit/delete; event/General grouping; active team assignment; optional due date; To do/In progress/Done; event/assignee/status/overdue filters; event task lists and real overview counters. Add expense summaries and existing invitation estimates to the overview.                                                                                                                                                | Overdue follows wedding timezone, Done is excluded, disabled/cross-wedding assignees are guarded, task changes never advance ceremony status. Update photo counters only once photos exist.                                             |
| 6     | M6A — Photo infrastructure and upload processing  | Private S3/IAM/CORS; decide HEIC and upload limits; guest/team submissions and bounded upload capabilities; wedding/event QR codes; uploader name and event/General; per-file progress, partial failure/status/retry; upload closure; byte/type/size validation and metadata stripping; immutable originals/compressed previews; image jobs with leases, bounded retries and crash recovery.                                    | Real S3 staging uploads/processing pass with malformed files, interrupted batches and resource limits. New guest images remain pending/family-only; this internal slice alone is insufficient to expose photos to guests.               |
| 7     | M6B — Moderation, galleries and covers            | Team pending previews, individual/batch approve/reject/delete and explicit audience; team attribution; public approved-only gallery; private view-only family gallery with enable/disable/rotation; event/source filters, pagination, submission-based attribution/counts; authorised short-lived media and cache bounds; managed website cover selection/fallback.                                                             | Every original, thumbnail, listing and count respects audience and wedding isolation. Rotation blocks new authorisation. Replace sample imagery with approved managed assets where appropriate; final owner visual review remains.      |
| 8     | M6C — Export, expiry and cleanup                  | Pre-expiry team downloads and background archives; expiry display; request-time denial across upload/gallery/media/export at the seven-day boundary; version-fenced date changes; expired/abandoned staging cleanup; deletion retries and retained S3-version cleanup; minimal cleanup status and documented backup/lifecycle policy.                                                                                           | Injected-clock expiry, stale workers, failed deletes, archive expiry and approximately 200-photo workload pass. M6A–C ship together before public photo access; existing date guards do not implement storage deletion.                 |
| 9     | M7A — YouTube streaming                           | Per-event team configuration and enablement, guest embeds, conditional navigation and Open on YouTube fallback.                                                                                                                                                                                                                                                                                                                 | Missing/disabled streams stay hidden; unavailable embed has a working external fallback. No video hosting.                                                                                                                              |
| 10    | M7B — Google Places vendor discovery              | Private service/location search; manual city/venue defaults and opt-in current location; server-side Places integration, result details/contact/listing links and pagination; attribution/privacy/terms, billing quotas and permitted caching; explicit empty/error/location-denial states.                                                                                                                                     | Real provider acceptance, quota handling and manual-location search pass. No fabricated proximity or permanent vendor directory. Owner chooses Google usage budget.                                                                     |
| 11    | M8 — Full pilot and stabilisation                 | Complete BUG-001–003 wording/feedback maintenance; finish QA-001–007; cross-feature two-wedding and role/capability tests; mobile/keyboard/contrast review on real devices; network outage/reconnect, guest refresh, timezone/session/rate boundaries and fresh-process guest HTML/assets; backup restoration, restart/job recovery, concurrency/load and deletion-lag rehearsal. Review all three themes and approved artwork. | No unresolved release-blocking privacy/data-loss defect; owner walkthrough and production rehearsal recorded. Production rollout follows tested gates, not the historical dates below.                                                  |

Why this order: recover the shared environment first; make existing invitations reliable before sending to families; establish staging early; deliver private financial/preparation tools next; implement photos as a complete access/processing/deletion lifecycle; then add independent provider features and run the full pilot. This retains the existing M5 → M6 → M7 → M8 roadmap and splits it into reviewable units. M5 and unrelated development can continue while controlled provider acceptance is being arranged, but real invitations wait for their release gates.

Open decisions: actual wedding date/family count and sending cutoff; hosting/domain/region/budget; verified sender and controlled recipients; S3/HEIC/limits and retention-compatible backup settings; Google budget; final visual approval. The current implemented email policy is team-reviewed batches with explicit resends disabled. Automatic daily sending, a new resend policy, RSVP, guest accounts, booking/payments and granular Manager permissions are outside this backlog unless separately requested.

Scope reconciliation: the original PRD excludes delivery/read receipts while the later owner-added email contract introduces provider delivery/bounce reporting. Use the later documented M4B extension for email transport outcomes; do not infer read tracking or WhatsApp delivery automation. Earlier planning text asking whether to automate batches or allow resends is historical; current reviewed/no-resend behaviour governs. Theme IDs remain Traditional/Floral/Minimal; final visual review does not add a theme designer.

Initial connectivity evidence: on 22 October the private development configuration validated; an unsandboxed read-only MongoDB ping failed with `MongoServerSelectionError`, port 3000 was unavailable and the frontend-proxied readiness route returned 502. Atlas browser access redirected to login, so current IP-rule mismatch has not yet been inspected or confirmed. No rule, credential, database content or TLS setting was changed. Current IP values and credentials are deliberately omitted. Follow-up after owner sign-in: Atlas showed the current-IP-added confirmation, the application adapter ping passed, direct/proxied readiness returned 200 and both anonymous auth reads returned 401; the browser login form rendered. The agent made no Atlas rule change. Order 1 is now complete for local connectivity; stable hosting egress remains an operational planning task.

## Start here

Build one complete user journey at a time: shared contract → migration → backend → React screen → tests → staging review → production release when ready. This lets the owner use and review real behaviour after each milestone.

**First feature: create an account and its wedding, sign in, and reach a private dashboard.** Every later feature depends on the authenticated wedding boundary. Start with a small dashboard shell; add its actual task, invitation, expense and photo summaries as those modules ship. Do not populate an apparently live dashboard with invented totals.

[PROJECT_STATUS.md](./PROJECT_STATUS.md) records what actually exists. This document records intended sequence, proposed dates, dependencies and release criteria. The root [PRD](./PRD.md), [architecture](./SYSTEM_ARCHITECTURE.md), [database design](./DATABASE_DESIGN.md) and [API design](./API_DESIGN.md) remain the baseline, subject to the explicitly recorded new email requirement below.

## Planning assumptions and invitation dates

The owner has no actual pilot wedding date yet. Use **31 December 2026** as a planning scenario, not a confirmed real event. Invitations start 45 calendar days earlier: **16 November 2026**, in `Asia/Kolkata`. There are 29 calendar days from this roadmap's creation to the proposed first invitation batch.

The owner requested batches of **25 invitations per day** and Resend for email invitations (interpreting “resent” as Resend). Recommended initial interpretation: 25 new family invitation records per wedding per calendar day, one individually addressed email per family, with a team member reviewing and triggering each batch. This is an application policy, separate from provider quotas. Automatic daily dispatch is not yet requested explicitly; it is a separate decision before implementing a scheduler.

For `F` families with valid email addresses:

- Sending days = `ceil(F / 25)`.
- Final sending date = 16 November + sending days − 1.
- The final batch can contain fewer than 25 families. The examples assume every day is used and no provider/recipient failures delay sending.

| Families receiving email | Sending days | Final batch date |
| ------------------------ | ------------ | ---------------- |
| 100                      | 4            | 19 November 2026 |
| 200                      | 8            | 23 November 2026 |
| 250                      | 10           | 25 November 2026 |
| 500                      | 20           | 5 December 2026  |

The actual family count and desired final invitation cutoff are still needed to confirm capacity. Families without email retain the manual WhatsApp/copy-link path. Re-sharing through another channel does not create another family or increase the unique sent-family estimate.

## New scope: family email invitations through Resend

The earlier baseline specifies manual WhatsApp sharing plus account setup/recovery email. Direct family invitation emails are an owner-requested addition, not an existing API capability. Plan and reconcile the following before implementation; do not silently reinterpret old `sentStatus` fields:

- Optional family contact email; require a validated address only for email dispatch. Never expose contact email in guest invitation responses.
- A team-only batch preview/confirmation action, per-family dispatch records and an email-delivery job type. Define the exact routes, schemas, indexes and retention in the baseline documents as a deliberate contract change.
- One durable dispatch per invitation/message version, with individual recipient addressing. Do not put the family list in a shared To/CC field.
- Reserve the daily allowance atomically so concurrent Admin/Manager actions cannot each send a separate set of 25. Account setup/reset emails do not consume the family-invitation allowance.
- Keep batch, queued, provider-accepted, delivered, bounced/failed and unknown-outcome states distinct. Display mixed outcomes and retry only the intended recipients. Repeated clicks and retries must not create duplicate dispatches.
- Preserve the existing manual Sent workflow for WhatsApp. Proposed email behaviour: mark the invitation Sent when Resend accepts that family's email, while delivery status remains separately visible. A later bounce is flagged for follow-up; it does not silently change an unconfirmed estimate into an attendance count. Confirm this rule before shipping.
- Track explicit resends separately from first invitations. They do not increase unique family estimates and must have their own controlled sending limits. Reconcile uncertain provider outcomes before sending again.
- Add signed, deduplicated webhook handling if delivery/bounce labels are displayed; provider acceptance alone is not evidence of recipient delivery. Do not add read receipts or RSVP as part of email work.
- Keep application-level dispatch history/idempotency beyond the provider's retry window. Resend currently retains provider idempotency keys for 24 hours, so a crash/retry after that boundary must not blindly resend. [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys)
- Recommended: use the same server-side Resend adapter for Manager setup and password recovery, with separate templates and delivery records. Development uses a private local outbox; staging uses allowlisted test recipients until live sending is reviewed.

Select and verify a sending domain, configure `EMAIL_FROM`, `RESEND_API_KEY` and later the webhook secret privately. Resend requires an API key and verified domain for this integration. [Resend Node.js guide](https://resend.com/docs/send-with-nodejs) Review actual account quotas before the first batch; no pricing plan or email has been provisioned/sent by this roadmap.

## How the UX references will be used

Use the existing Olive/Ivory dashboard, serif headings, warm surfaces, mobile navigation, event cards and family-list layouts as visual references. Rebuild them as accessible React components with CSS Modules and design tokens. Preserve all reference HTML/screenshots unchanged; do not import their CDN Tailwind runtime or inline event handlers into production.

| Reference                                                                                          | Use during development                                                                                                              |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `marriage_suite/DESIGN.md`                                                                         | Extract colour, spacing, typography and interaction tokens; check contrast rather than assuming the document's accessibility claims |
| `planning_home_desktop/`, `planning_home_mobile/`, `marriage_suite_wedding_planning_guest_portal/` | Dashboard shell and module summaries as real modules become available                                                               |
| `website_settings_guest_theme_selection/`                                                          | Theme preview/selection and presentation-only switching                                                                             |
| `guest_wedding_home_desktop/`, `guest_wedding_home_mobile/`                                        | Guest home, Today/schedule, contacts, announcements and photo entry points                                                          |
| `guest_wedding_home_desktop_theme_b_champagne_atelier/`                                            | Second guest visual direction and alternate layout reference                                                                        |
| `family_invitations_desktop/`, `family_invitations_mobile/`                                        | Family list, selected-event controls, share actions and responsive cards/table; extend with the new email batch review              |

All paths above are relative to `stitch_marriage_suite_ui_design/`. That directory is deliberately excluded from Git, so a new contributor must obtain a separate copy from the owner. The tracked roadmap contains its inventory; CI must not depend on these local files.

### Required UX corrections and missing screens

| Finding                                                                                                             | Roadmap treatment                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RSVP, recorded responses, confirmed attendees, response rates and estimates based on confirmed families             | Remove from the planned implementation; show unique Sent families and the 2–3-person estimate range. For example, 118 Sent families means 236–354 estimated attendees, not approximately 95                                                      |
| Fixed guest counts, family passes, privileged entry and restricted invited-event access                             | No family-size cap or access pass. Invitation highlights selected events; every guest can see the full schedule                                                                                                                                  |
| WhatsApp “Delivered”/automatic dispatch wording                                                                     | Sharing opens the user's flow. Sent remains manual for WhatsApp; no WhatsApp delivery claim                                                                                                                                                      |
| Seating, accommodation allocation, PDF itineraries, reminder controls and automatic translations implied by mockups | Do not infer these features from decoration or sample content. Preserve baseline scope; agree any additions separately                                                                                                                           |
| Olive Journal / Champagne Atelier / Plum Evening versus current `traditional` / `floral` / `minimal` identifiers    | Use the UX styles as proposed visual directions. Agree display labels and their mapping before theme implementation; do not silently rename shared/API identifiers                                                                               |
| Named-family greeting shown on general guest home                                                                   | Render personal family information only after validating its invitation link; never on the general public projection                                                                                                                             |
| Three invalid PNGs                                                                                                  | `planning_home_desktop/screen.png`, `guest_wedding_home_desktop/screen.png` and `guest_wedding_home_mobile/screen.png` are 28-byte text files, not images. Use available HTML and valid screenshots; regenerate reference images later if useful |

Missing UX work includes registration/login/reset, Manager setup, event/task/expense editors, upload progress/partial failures, moderation, private-link rotation, export progress/expiry and the new email-batch preview. Define each screen's loading, empty, validation, save-conflict and failure states immediately before its feature milestone. Do not spend the first month recreating every static mockup.

## Milestones and proposed calendar

Dates below are planning targets, not effort guarantees. Developer availability, review turnaround, DNS/provider readiness and family count are unknown. Review the schedule after M1 using actual delivery speed. If the core invitation release fails its acceptance checks, move the invitation date instead of bypassing them.

| Milestone                           | Target window          | User-visible result                                                                   | Release destination                                                   |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| M0 — Readiness and UX alignment     | 19–20 October          | Confirm contracts/design corrections, migration approach, CI and hosting choice       | Deploy scaffold to isolated staging when hosting is ready             |
| M1 — Account and wedding foundation | 21–25 October          | Register one wedding, sign in/out and reach its private dashboard shell               | Staging                                                               |
| M2 — Team and account email         | 26–28 October          | Invite/disable Managers and recover passwords through Resend                          | Staging with controlled recipients                                    |
| M3 — Website, events and themes     | 29 October–5 November  | Preview/publish a useful guest site, manage ceremonies, switch three themes           | Staging; use generated artwork/fallbacks until photo lifecycle exists |
| M4 — Families and email invitations | 6–12 November          | Personal links, manual WhatsApp sharing, 25-family email batches and honest estimates | Staging, then invitation-release candidate                            |
| Invitation rehearsal                | 13–15 November         | Test actual production origin, sender domain and links with team addresses            | Controlled production verification                                    |
| First invitation release            | 16 November            | Send the first team-reviewed batch of up to 25 families                               | Production; remaining incomplete features hidden/unavailable          |
| M5 — Expenses and tasks             | 17–23 November         | Track payments, balances, assignments and preparation work                            | Staging review, then production                                       |
| M6 — Complete photo lifecycle       | 24 November–7 December | Upload, moderate, share approved photos, export and enforce expiry                    | Staging adversarial tests before enabling in production               |
| M7 — Streaming and vendors          | 8–13 December          | YouTube embeds/fallbacks and Google Places discovery                                  | Staging review, then production                                       |
| M8 — Complete version-one rehearsal | 14–20 December         | All baseline flows and owner-added email flow verified together                       | Full version-one production release only after checks pass            |
| Stabilisation                       | 21–30 December         | Fix defects, test devices/providers, rehearse recovery and prepare contacts           | Avoid structural migrations/new integrations; ship verified fixes     |
| Planning-scenario wedding           | 31 December            | Team updates live ceremonies; guests use proven flows                                 | Monitor and support                                                   |

The 16 November release is a usable invitation release, not a claim that all version-one features are complete. Hidden/incomplete routes must not be exposed through APIs or advertised with working-looking buttons. Every baseline feature remains part of full version one. If the owner wants every feature live before the first invitation, M5–M8 must move earlier or 16 November must move later.

### M0 — Readiness, contract alignment and first deployment

- Independently verify application readiness and development database permissions with a controlled setup/test procedure. Keep separate test data and do not seed the real wedding by accident.
- Design the migration runner and history collection; plan additive validators/indexes per feature instead of creating the entire application schema upfront.
- Reconcile the owner-added email requirement and UX conflicts in a reviewed specification change before implementing affected contracts. Finalise theme labels/IDs and auth-token lifetimes.
- Add GitHub Actions for `npm ci` and `npm run check`, matching the pinned Node/npm versions. Unit/component tests remain credential-free. [GitHub Node.js CI guidance](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs)
- Select hosting and sender domain. Recommended hosting shape: one always-on Node service that can run the bounded monolith job loop, serve Vite output and connect to Atlas/S3. Avoid a request-only runtime for durable in-process jobs. Provider and budget remain owner decisions.

Exit check: a new checkout passes CI; staging health/routing works; configuration and migration procedures are documented. This milestone adds infrastructure deliberately, not extra microservices or Redis.

### M1 — First complete feature: account → wedding → private dashboard

Implemented on 18 October 2026 ahead of the indicative dates. See AUTH_IMPLEMENTATION_PLAN.md and PROJECT_STATUS.md for evidence and remaining deployment work.

- Implement the first migrations for wedding/account/session boundaries and required uniqueness, plus audit records as needed.
- Build register/login/logout/current-user contracts and forms. Create wedding and sole Admin atomically; retry slug collisions; use the main date/timezone consistently.
- Implement Argon2id passwords, opaque hashed sessions, login rotation, expiry/revocation checks, CSRF/origin checks and rate limits. Derive the wedding from authenticated state.
- Build a responsive dashboard layout from the UX references with genuine empty states and permitted navigation.

Exit check: register two independent weddings; sign in/out; reload a session; deny anonymous/private access and all cross-wedding reads/writes. Duplicate email, failed transactions and attempted second-wedding membership must be tested. Add the first Playwright journey here.

### M2 — Team, recovery and durable email foundation

Implementation added on 18 October 2026. See TEAM_RECOVERY.md and PROJECT_STATUS.md. Real Atlas migration/concurrency tests and both Atlas-backed browser journeys passed after network repair on 18 October 2026; development migration 002 is applied. Controlled Resend delivery and staging HTTPS acceptance remain required.

- Add Manager invitation/acceptance/resend/revoke and disablement, plus password recovery. Only Admin controls team access; both team roles manage operational data later.
- Add the first durable email jobs with atomic leases, retry/backoff and idempotent dispatch effects. The same runner will later handle photos; no separate queue service is needed.
- Implement the Resend adapter, verified-sender configuration and templates. Keep a private development outbox and staging recipient restrictions.

Exit check: a Manager accepts once into the correct wedding; reused/expired/replaced links fail; disablement/password reset revoke sessions; the sole Admin cannot be disabled. Verify failures without leaking account existence or token URLs. Send real staging test emails only to reviewed team recipients.

### M3 — Wedding website, ceremonies and three themes

Implemented on 18 October 2026 on feature/wedding-website-events. See WEBSITE_IMPLEMENTATION.md and PROJECT_STATUS.md for the 100-test root check, 15 real Atlas tests, browser journeys, development migration and remaining review/staging limits.

- Implement content/settings, chronological events, contacts/maps, announcements and manual ceremony status. Revisions/`If-Match` prevent silent overwrites.
- Add private preview, publication/unpublication and stable published slugs. Saved edits go live after first publication; unpublishing hides anonymous content/media authorisation.
- Build the shared guest model and first theme completely, then adapt the other two presentations. Dashboard style remains independent. Use photo fallbacks until M6 provides managed cover media.
- Poll active guest pages every 25 seconds, refresh on return and show last-success/error states. Event status never advances automatically.
- Add safe per-wedding HTML metadata/social previews without personal family information or private media.

Exit check: both roles can publish/update; unpublished content stays private; all three themes preserve data and links; a second browser sees changed times/status within the agreed refresh target. Mobile layouts, keyboard access, contrast and tap-to-call/maps are reviewed.

### M4 — Families, personal links, estimates and email batches

M4A manual-sharing slice is implemented locally: family records, selected-event personal links, manual Sent tracking and estimates. See INVITATIONS_IMPLEMENTATION.md and PROJECT_STATUS.md for acceptance evidence. M4B reviewed family email is implemented locally, with atomic 25-new-family daily reservations, safe original retries, signed delivery callbacks and provider reconciliation. The owner disabled explicit resends. See EMAIL_INVITATIONS_IMPLEMENTATION.md for policy and PROJECT_STATUS.md for verification; controlled real provider acceptance remains pending.

- Build family records, selected active events, protected invitation links and encrypted recoverable link storage. Public invitation responses omit private contact data.
- Implement manual WhatsApp/copy sharing, manual Sent tracking and unique-family/event estimates. No RSVP or family-size limit.
- Implement the Resend dispatch model described above, daily allowance, batch review, per-recipient outcomes, guarded retries and verified webhook processing where shown.
- Use individual email jobs initially; a daily group of 25 does not require one provider batch API request. Preview exactly which families and message versions will be sent.

Exit check: team selects 25 new families, previews and confirms once; duplicate clicks/restarts do not duplicate invitations; partial failure does not resend accepted recipients; concurrent batches cannot exceed the agreed allowance. Wrong-wedding email actions and forged/replayed webhook effects fail. Sent-family estimates remain unique across channels.

### M5 — Expenses and preparation tasks

M5A expenses/payments are implemented locally on 22 October 2026; see EXPENSES_IMPLEMENTATION.md and PROJECT_STATUS.md for verification and migration state. M5B tasks/overview remains next. The ordered backlog above preserves the original deliverables; its expense row is now implemented rather than pending.

- Implement expense costs and payment entries using BSON Long/integer paise and decimal-string API representations. Add revision/idempotency guards and separate overpayments from outstanding balances.
- Implement event/General tasks, active team assignees, due dates and todo/in_progress/done states. Derive overdue in the wedding timezone; tasks do not change ceremony status.
- Populate dashboard cards only with the implemented summaries. Add filters and clear missing-data states.

Exit check: the PRD's ₹80,000 expense with ₹20,000 and ₹30,000 payments gives ₹30,000 outstanding; retries/concurrent changes preserve totals. Cross-wedding expense/task access fails; due-date boundaries and disabled assignees are covered.

Tasks are grouped with expenses earlier than the PRD's illustrative delivery sequence because both make the private dashboard useful while the larger photo lifecycle is being prepared. This changes sequencing only, not version-one scope.

### M6 — Photos, private galleries, exports and retention

- Prepare private S3 access and constrained staging uploads. Extend the existing job runner for actual-byte validation, metadata stripping, immutable originals/previews and bounded processing.
- Build per-file progress/retry, upload capabilities, moderation and explicit audience selection. New guest photos remain pending/family_only; public projection requires ready + approved + public.
- Implement view-only private-gallery sessions, disable/rotation, audience-safe counts and short-lived authorised media. S3 presigned URLs are temporary permissions, not permanent public URLs. [AWS presigned URL documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- Implement pre-expiry team exports, delete/recovery workflows, authoritative expiry checks, periodic sweepers and physical cleanup including configured retained versions.
- Add managed cover-photo selection under the same visibility/expiry rules; switch to a visual fallback after expiry.

Exit check: pending/rejected/family-only bytes cannot leak publicly; revoked links cannot obtain new access; retries/stale leases cannot publish deleted/expired media; visibility changes have bounded existing URL access. Test partial batches, malformed files, worker crashes, at least the approximately 200-photo planning volume and concurrent browsing.

For the planning-scenario wedding date, access ends at **8 January 2027, 00:00 Asia/Kolkata** (after availability through 7 January), including team exports. Recompute from the actual stored wedding date if changed. Test this boundary with an injected clock; do not wait for January to discover retention defects. Deleted bytes cannot be resurrected by changing the date.

### M7 — Streaming and vendor discovery

- Add team-configured YouTube event streams, hidden navigation when absent and an external fallback.
- Add Google Places Text Search through the server, manual service/location input, opt-in device location, necessary attribution and honest provider-error/empty states.
- Confirm external quotas and provider/display rules before enabling search. Do not persist a permanent copy of listings or add booking, payments or reviews.

Exit check: an unavailable embed still has a usable fallback; location denial, empty results, quota/provider errors and missing contact information render correctly.

### M8 — Full pilot acceptance

Re-run every PRD pilot scenario with two weddings and all access contexts: Admin, Manager, public guest, invitation viewer, private-gallery viewer and upload capability. Include a real phone/network review, email retry/reconciliation, stale editor conflicts, backup/restore rehearsal, restart recovery and retention/export boundaries. Confirm no unresolved release-blocking data-loss or access-control defect.

## Deployment approach at every milestone

| Stage                         | Recommended setup                                                                                                              | Promotion condition                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Local development             | Existing development Atlas configuration; private outbox/provider substitutes                                                  | Feature tests and `npm run check` pass                                              |
| Automated tests               | Credential-free default suite; isolated integration database when needed                                                       | Reproducible install/build; no production secrets or data                           |
| Staging                       | One HTTPS origin; separate Atlas database/user, S3 bucket and email configuration; synthetic weddings and team-only recipients | Owner completes the milestone walkthrough; migrations and restart behaviour checked |
| Production invitation release | Reviewed commit with M1–M4 complete, stable domain, sender verification, backups and operational checks                        | Invitation rehearsal passed; no incomplete guest feature is advertised              |
| Full version-one production   | All milestone criteria and pilot scenarios passed                                                                              | Explicit release decision and recorded rollback procedure                           |

Choose hosting in M0 so staging exists early. A dedicated staging database on the existing cluster is sufficient initially if its capacity/permissions allow it; production gets separate database credentials/configuration. Do not add per-feature services or per-branch databases without a demonstrated need. Staging access controls must prevent public exposure; `noindex` alone is not access control.

For each release:

1. Finish a small `feature/...` branch from `develop`, including tests, contracts/migrations and progress notes.
2. Run CI and review the change; merge to `develop` and deploy the reviewed commit to staging.
3. Record the commit/build identifier. Build shared → server → client; package workspace manifests/links and runtime dependencies correctly. Use relative browser API URLs to preserve the same-origin deployment.
4. Review secrets/network access, sender/recipient routing, and health checks. Configure proxy trust for the actual hosting topology before relying on secure session cookies.
5. Back up before production schema changes. Apply additive, versioned migrations as an explicit release step; do not automatically migrate on every process startup.
6. Promote the reviewed release/artifact to production using a protected production branch/tag convention. If `main` does not yet exist, establish it from the first reviewed release; do not rewrite existing history. Production promotion should not happen on every feature push.
7. Check liveness/readiness, real login cookies/CSRF, frontend deep links/API 404s, guest publication and a permitted provider operation. Record success or roll back the application artifact.
8. Monitor failed email dispatches, upload errors, lease failures, job backlog, deletion lag and database health. A failed release stops invitation dispatch until reconciled.

Rollback uses the previous compatible application artifact. Database changes should remain backward-compatible; do not run destructive down-migrations or restore an entire database casually after users have written new records. Reconcile queued jobs and pending external sends after a restart/rollback rather than assuming exactly-once delivery.

No hosting account, workflow, email, domain, database migration or deployment is created by this planning document.

## Ready-to-start development backlog

Current next feature work: **M5B tasks and overview**, after connectivity recovery and alongside the relevant review/staging prerequisites above. M1–M4B and M5A code is implemented; the table below preserves the original early-milestone breakdown and is not the current pending list.

| Issue | Deliverable                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------- |
| M0.1  | Reconcile new Resend invitation requirements, theme labels and UX scope notes; choose manual versus automatic batch policy |
| M0.2  | Agree hosting/domain/budget and establish isolated staging/CI                                                              |
| M1.1  | Versioned core migrations, uniqueness and transactional wedding/Admin registration                                         |
| M1.2  | Password/session primitives, login/logout/me, CSRF and rate limiting                                                       |
| M1.3  | Accessible registration/login and responsive dashboard shell                                                               |
| M1.4  | Two-wedding isolation, transaction/replay/session tests and first browser journey                                          |
| M1.5  | Stage the complete journey, review it with the owner and update handoff documentation                                      |

For every milestone, maintain `PROJECT_STATUS.md` with actual completion, tests run, screenshots/review notes, known limitations and next actions. Keep this roadmap's target dates separate from actual completion dates. Future commits use the owner's configured `skyup259` identity; committing/pushing this planning change is a separate action if requested.

## Decisions still needed

1. Approximate number of families and final desired invitation date; confirm the 31 December 2026 scenario when a real wedding is chosen.
2. Current email policy is team-triggered reviewed batches with explicit resends disabled. Revisit only if the owner requests a policy change; automatic dispatch is not pending baseline scope.
3. Sending domain/from address and hosting provider/region/budget. Resend is the selected email direction; provisioning remains pending.
4. Theme display names and stable identifier mapping; do not block authentication work on decorative design.
5. Final upload/HEIC policy, S3 operating configuration and backup/restore settings before the relevant milestones.
