# Project status and development handoff

Last updated: 22 October 2026 (Asia/Kolkata).

This is the living entry point for a new contributor. It records actual implementation progress, decisions, verification, limitations and the next development steps. Read [README.md](./README.md) for commands and setup, then the linked baseline documents for product details.

## Current milestone

**22 October connectivity/planning review:** connectivity restored after owner Atlas sign-in/current-IP update. The application adapter ping and direct/frontend-proxied readiness pass; both anonymous auth checks return 401 and the browser login page loads. No Atlas rule was changed by the agent. The [updated ordered backlog](./DEVELOPMENT_ROADMAP.md#remaining-work-and-recommended-order--22-october-2026) separates completed M1–M4B implementation from external acceptance and sequences expenses, tasks, the full photo lifecycle, streaming, vendors and pilot readiness.

**M4B reviewed email batches remain implemented locally after pushed M4A commit `8811aef`, with deferred QA findings in BUG_BACKLOG.md. On 20 October the owner requested temporary photography from the UX references; local reference assets now appear across the site. Root checks (136 tests), five in-memory browser journeys and desktop/mobile photo loading checks passed. Explicit email resends remain disabled and live provider delivery remains unverified. Historical M4B check results and configuration findings are recorded below.**

The owner approved authentication and then M2 implementation on 18 October 2026. Registration creates one draft wedding and its sole Admin atomically, signs in, and opens a protected dashboard showing real account/wedding details. `/login`, `/signup` and `/dashboard` are available. The private query cache is cleared on logout/account changes, and sessions are restored after refresh.

See [WEBSITE_IMPLEMENTATION.md](./WEBSITE_IMPLEMENTATION.md) for M3 behaviour/scope and [TEAM_RECOVERY.md](./TEAM_RECOVERY.md) for M2 configuration/acceptance limits; [AUTH_IMPLEMENTATION_PLAN.md](./AUTH_IMPLEMENTATION_PLAN.md) records the first slice, [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) records the remaining sequence. Deployment is handled by the owner; no hosting, real email dispatch or production release was performed.

Deferred findings are tracked in [BUG_BACKLOG.md](./BUG_BACKLOG.md), with severity, priority, reproduction steps, causes and acceptance criteria. QA gaps and release prerequisites are recorded separately from confirmed bugs. The owner requested documentation now and fixes later: four Low/P3 findings and BUG-005, a Medium/P2 email outcome/reconciliation defect, remain open. BUG-006 was found in the latest manual email-batch QA. Unrelated development may continue.

## Confirmed architecture and product decisions

| Area        | Decision                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Application | Modular monolith; React/TypeScript/Vite frontend; Express/TypeScript backend                                                         |
| Repository  | npm workspaces: client, server, shared; ESM; CSS Modules and CSS variables                                                           |
| Database    | MongoDB Atlas with official driver; separate development/production configuration; no Docker                                         |
| Access      | Email/password and MongoDB-backed opaque sessions implemented; Admin/Manager accounts belong to one wedding; Guests have no accounts |
| Production  | Same-origin API and frontend; hosting provider undecided                                                                             |
| Photos      | Private S3; approved public and private-family views; seven-day access window anchored to main wedding date                          |
| Exports     | Team exports/downloads allowed before expiry; archive access cannot extend past photo expiry                                         |
| Publishing  | Preview before first publication; subsequent saved edits become live immediately                                                     |
| Dates       | One main wedding date anchors retention/slug; events can span multiple dates                                                         |
| Themes      | Three variants share behaviour/data; final visuals remain to be designed                                                             |
| Email       | Resend adapter and reviewed family batches implemented; development defaults to private outbox; live provider delivery unverified    |

## Implementation tracker

| Workstream                       | State                      | What exists / what remains                                                                                                                     |
| -------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace/build configuration    | Complete                   | Three packages, explicit shared exports and build-before-consumption scripts                                                                   |
| Frontend foundation              | Complete                   | Neutral React shell, routing, query provider, typed health request, CSS Modules                                                                |
| Backend foundation               | Complete                   | App factory, configuration, safe logging/errors, health, Atlas adapter, production routing                                                     |
| Shared contracts                 | Complete                   | Infrastructure, theme identifiers and strict auth request/safe response schemas                                                                |
| Tests and checks                 | M4B checks passed          | Latest root check: 136 tests across 22 files plus formatting/lint/types/build; all 26 Atlas integration tests and five browser journeys passed |
| Atlas application connectivity   | Restored 22 October        | Live adapter ping and direct/proxied readiness passed after owner current-IP update; schema/write suites not rerun                             |
| Database schema/migrations/seeds | M4B applied to development | Explicit 001/002/003/004/005 migrations completed in verified development database; no business data seeded                                    |
| Authentication and team          | M2 Atlas verified          | Manager access and password recovery passed real persistence/browser checks; controlled Resend and production HTTPS acceptance remain          |
| Wedding website/events/themes    | M3 Atlas verified          | Settings, event edits/archive, announcement, private preview, publish/unpublish, three themes, live guest refresh and safe social metadata     |
| Invitations/estimates            | M4B Atlas/outbox verified  | Families, personal links, manual Sent/estimates and M4B reviewed email batches implemented; real provider acceptance pending                   |
| Expenses/tasks                   | Not implemented            | Exact money, revisions and wedding isolation required when built                                                                               |
| Photos/moderation/exports/jobs   | Not implemented            | Full lifecycle and expiry protection required before enabling                                                                                  |
| Vendors/streaming                | Not implemented            | Google Places discovery and YouTube embedding later                                                                                            |
| Deployment                       | Not configured             | Hosting, production Atlas/S3/email and operational policies pending                                                                            |

## Latest authentication verification

Verified on 18 October 2026:

- Latest manual QA after the owner's connection fix: development readiness returned `ready` and the browser showed the service connected. Core signup/login/logout, validation, refresh, signed-in redirects, duplicate signup and cross-tab logout passed against built assets with real Atlas in an isolated test database. Persistence inspection found one synthetic user/wedding and zero active sessions after logout; the exact temporary database was removed with awaited cleanup. Two minor validation/feedback issues remain; mobile viewport testing was inconclusive because the browser override did not apply. See [MANUAL_AUTH_QA.md](./MANUAL_AUTH_QA.md) for cases, reproductions and limits. `npm run build` passed for this QA run; previous automated test results below remain historical.
- `npm run check` passed: formatting, zero-warning lint, root/package TypeScript, 45 tests across eight files, and production build.
- `npm run test:integration` passed four real Atlas tests: migration idempotency, validators/unique indexes, safe session lifecycle/wedding isolation, rollback after late failure, concurrent duplicate registration and atomic shared rate counters. Integration teardown completed. Two browser-test databases left by interrupted child shutdown were found and explicitly removed; browser cleanup is now also awaited by Playwright global teardown.
- `npm run test:e2e` passed the complete real browser journey against built assets and a separate temporary Atlas database: anonymous redirect, two-step signup, keyboard step navigation/focus, refresh, logout/private denial, wrong/correct login and mobile viewport without horizontal overflow. Desktop signup/dashboard and mobile login/dashboard screenshots were visually reviewed.
- `npm run db:migrate` applied the auth schema to `marriage_suite_dev`; no wedding/account was seeded. Auth remains unavailable until the explicit migration has been applied in each new environment.
- Existing development services were already listening on ports 5173/3000; an additional combined start exited on the occupied frontend port. Existing services were preserved and verified: direct/proxied readiness 200, anonymous `/auth/me` 401, `/auth/csrf` 200 and `/login` 200. Use `http://127.0.0.1:5173/signup` to create your first account.
- Final connectivity recheck: the machine’s public IP changed away from the recently approved Atlas entry. A subsequent browser rerun failed during TLS negotiation and local readiness became unavailable. The prior successful feature/integration/browser checks above remain valid historical evidence; final live recheck is pending an updated Active Atlas IP entry. A later browser timeout occurred before this TLS failure; its awaited global cleanup completed.
- Real production HTTPS cookies/proxy settings, hosting and email remain unverified. No deployment, commit or push performed for this feature.

## M2 verification and limitations

Implemented on 18 October 2026. `/team`, `/accept-invitation`, `/forgot-password` and `/reset-password` are connected to the API. Only Admin can manage access; Managers see their wedding’s team without other accounts’ emails. Resend/revoke and member changes enforce revisions. Acceptance and reset use transactions and single-use expiring tokens; password reset and Manager disablement revoke sessions. The sole Admin/global wedding-isolation rules remain intact.

Email defaults to a private local outbox; the optional Resend adapter requires explicit configuration and non-production recipient restrictions. Durable jobs use encrypted envelopes, leases/version fencing, bounded retries and provider idempotency. Delivery status distinguishes queued/local-outbox/provider-accepted outcomes. Token storage retains the baseline expiry TTL; invitation summaries are not a permanent archive. Live jobs have no TTL, and terminal job/audit metadata policy remains a production prerequisite. See TEAM_RECOVERY.md for operational details and the encrypted-envelope extension to the original hash-only auth-token contract.

Initial M2 implementation checks, before network access was repaired:

- Final `npm run check` passed: formatting, zero-warning lint, root/package TypeScript, 76 credential-free tests across 12 files, and the production build. Tests cover permissions, wedding isolation, link expiry/replacement/single consumption, rollback in a transactional substitute, session revocation, pagination, CSRF/rate limits, encrypted envelopes, provider/outbox adapters and lease/retry fencing. At that initial checkpoint MongoDB semantics still needed separate integration verification; the later repair recheck below completed it.
- Client suite passed: 13 tests across four files. The new forms validate inputs, scrub fragments, update session state and hide access controls from Managers.
- `npm run test:e2e:local` passed both browser journeys against built assets, explicit in-memory stores and a private temporary outbox. New coverage includes Manager invite/accept, mobile team pages, password reset, disablement and no horizontal overflow. Desktop team, mobile Admin/Manager team, setup and reset-success screenshots were reviewed. These are real browser/HTTP checks, not real MongoDB verification.
- `npm run test:integration` could not connect to Atlas: both suites failed during setup and all 10 database tests were skipped. No M2 migration, transaction/index/concurrency validation or development database changes are claimed. No real email, deployment, commit or push was performed.
- Added a dedicated `test:e2e:local` command without weakening default `test:e2e`/integration requirements. Default browser tests still require real Atlas and use guarded temporary database/outbox cleanup.

The later network-repair recheck below supersedes the initial Atlas blocker. Next: provision/verify Resend with controlled staging recipients and complete the real staging HTTPS/proxy/cookie walkthrough. Only after M2 live acceptance proceed to wedding/events, preview/publication and themes. The earlier manual auth QA notes and their two minor findings were preserved without unrelated fixes.

### Atlas recheck after network repair — 18 October 2026

- Owner added the current network address in Atlas. Independently verified the running development backend readiness before and after the migration; it returned `ready`. The protected team endpoint through the frontend proxy returned the expected anonymous 401.
- `npm run test:integration` passed all 10 tests across both real Atlas suites: migrations/validators/indexes, token concurrency, transactional rollback, password/session revocation, wedding isolation and abandoned-lease recovery/version fencing. Guarded temporary database cleanup completed.
- `npm run test:e2e` passed both journeys against built assets, real Atlas persistence and a private temporary outbox, including Manager acceptance, recovery, disablement and mobile layouts. Awaited test database/outbox cleanup completed. Reviewed the resulting mobile Admin team screenshot.
- The first browser attempt stopped because the generic status locator matched two loading messages. Narrowed only the two Admin success assertions to their message text; the rerun passed. Application permissions/behaviour were unchanged by this test fix.
- Verified the migration target was development and the expected development database, then `npm run db:migrate` successfully applied 001/002 as needed. The runner reported completion without seeding wedding/user records. Existing development services and records were preserved.
- Final `npm run check` after the selector/documentation update passed: formatting, zero-warning lint, all package/root types, 76 tests across 12 files and production build. `git diff --check` also passed.
- No live Resend message, production migration/deployment, Git commit or push was performed. Provider acceptance/delivery and staging production-cookie/proxy behaviour remain unverified; local outbox success is not Resend verification.

## M3 verification and limits

Implemented on feature/wedding-website-events after M2 commit `27d396a` was pushed to origin/develop. New team routes are `/website`, `/events` and `/website/preview`; the published guest route is `/w/:slug`. Both team roles can edit operational content. No real development wedding was published or populated by the tests.

- `npm run check` passed: formatting, zero-warning lint, root/package types, 100 credential-free tests across 15 files and production build. The initial new-screen bundle warning was resolved by loading M3 routes separately; the final build has no oversized-chunk warning.
- `npm run test:integration` passed all 15 tests across three real Atlas suites. New coverage includes migration 003/indexes/validation, private drafts, publication/unpublication, competing revisions, transactional rollback after audit failure, archive-reference protection, wrong-wedding denial and Manager/disabled-account authority. Temporary databases were cleaned up.
- `npm run test:e2e` passed all three real Atlas journeys. M3 covers ceremony creation, saved preview, publication, theme changes with stable content/links, phone/map actions, mobile overflow, live manual status and a guest announcement received through automatic refresh, escaped HTML metadata, and unpublication. The website-only journey passed again after the final lazy-route/unavailable-page refinements, including a friendly unavailable screen after unpublication and an automatic announcement update within the 30-second browser assertion. Awaited database/outbox cleanup completed.
- Reviewed desktop website settings/private preview and all three mobile guest-theme screenshots with synthetic data. The final desktop ceremony-editor screenshot was also visually reviewed. Earlier in development, a refined Zod response schema and an ambiguous duplicate ceremony-heading selector were corrected; resolved test failures are not external-service failures.
- Verified the migration target was the expected development database, then `npm run db:migrate` completed 001/002/003 as needed. No wedding/user/event records were seeded. After the last build/watch restart settled, direct development readiness returned ready and the proxied ceremonies API denied anonymous access with 401.
- Managed covers remain decorative fallbacks until M6; streaming configuration remains null until M7. Families/invitations, tasks/expenses, photos, vendor discovery and real email delivery are not enabled by M3. Full small wedding schedules are returned, with no-more-pages metadata, instead of silently truncating ceremonies.
- Main-date/timezone edits preserve the existing retention anchor, increment retentionVersion when expiry changes and reject access extension after cleanup may have started. Event instants stay fixed across timezone changes; published slugs stay fixed even after unpublication. Drafts remain private; public nested fields are whitelisted and unmanaged cover references never leak.
- Owner review, Resend delivery, HTTPS/proxy/cookie staging acceptance, CI/hosting and backup/restore rehearsal remain pending. No production deployment or real message has been performed. The owner authorised the M3 GitHub Desktop commit/push checkpoint below; M2's pushed checkpoint remains intact.

QA follow-up on 18 October: publishing from Preview now seeds the settings cache with the acknowledged wedding status/revision before returning. This prevents the cached draft from initializing a stale editor while its background GET runs. Mounted editors still retain their original revision and unsaved text for genuine conflict detection; explicit reload discards local edits. QA reported that the deliberate two-tab conflict retained text and explicit reload recovered it. Theme/team/recovery QA remains in progress. The new route regression reproduced the bug before the fix and passes afterward; the full root check passed all 101 tests, formatting/lint/types/build. This fix has no new Atlas/provider verification.

Independent manual QA follow-up: the owner's publication fix passed against the rebuilt frontend and isolated real Atlas persistence. Preview → publish → settings immediately showed Published, and saving an edit without reloading succeeded and appeared on the guest route. A genuine two-tab stale edit still failed safely and retained its text. The targeted website component command passed seven tests, including the pending-background-GET regression; root build passed. Broader M2/M3 manual checks and 19 supplementary HTTP scenarios are detailed in [MANUAL_M2_M3_QA.md](./MANUAL_M2_M3_QA.md), with coverage limits distinguished from historical suite results. The exact temporary database/outbox were removed. Mobile override remained ineffective; Resend/production verification is still pending.

Next: remaining minor validation/guard wording, mobile/focus-return QA and controlled staging/provider acceptance, then M4 family records, selected-event personal links, manual sharing and unique-family estimates; reconcile email-batch semantics before enabling real family dispatch.

## M4A verification and limits

Implemented locally on 18 October 2026 after the owner requested the next feature. See [INVITATIONS_IMPLEMENTATION.md](./INVITATIONS_IMPLEMENTATION.md). `/invitations` supports family creation/edit/archive, filters/pagination, selected ceremonies, stable encrypted personal links, explicit link replacement, WhatsApp/copy sharing and manual Sent state. Both team roles are allowed. Estimates count each active Sent family once with a 2–3-person range; selected ceremonies are highlights, never guest access restrictions. No RSVP or email dispatch is enabled.

- Root `npm run check` passed: formatting, zero-warning lint, root/package types, 119 tests across 19 files and production build. New contracts/encryption/HTTP/UI tests cover strict selection, failed-save retention, stale revisions, key authentication, link lifecycle, generic capability errors, Sent/estimate rules and wedding isolation. A new test exposed a Zod default leaking into partial patches; corrected the patch schema so a contact-only edit preserves omitted phone data and an empty patch remains invalid.
- Atlas integration suite passed 20 tests across four suites, including migration 004 validators/indexes, recoverable links, Sent/event estimates, archive invalidation, late-audit rollback, competing revisions, current Manager authority and the create-invitation-versus-archive race. Initial sandbox attempts could not open HTTP listeners or contact Atlas; checks with the necessary local/network access passed. Sandbox failures do not establish Atlas or product failures.
- `npm run test:e2e` passed all four real Atlas browser journeys, including family create/share/mark-Sent/re-share/rotate/archive, private-contact omission, complete schedule, token scrubbing/reopening and mobile overflow. The final invitation-only browser rerun also passed after moving selected venues/contacts to the top and labelling the full schedule. Reviewed desktop sharing and mobile team/personal-page screenshots. Both test database and outbox cleanup completed.
- Initial browser failures were resolved: a read-only textarea selector was corrected; a real rotation-response/client-contract mismatch was fixed with a dedicated shared response schema and regression test. A missing clipboard API now offers manual selection/copy fallback. No real external WhatsApp action was triggered.
- Strengthened the Atlas race check to use separate Admin and Manager accounts, proving the parent wedding write fence rather than same-user serialization; the targeted five-test Atlas suite passed. Migration 004 idempotency and the earlier full 20-test result remain recorded separately.
- Verified the migration target was development and the expected development database, then root `npm run db:migrate` completed migrations 001–004 as needed, seeding no wedding/family/contact records. Final live checks outside the network sandbox: backend readiness returned ready and anonymous proxied `/invitations` returned 401. Existing development services/config/data were preserved.
- Separate INVITATION_ENCRYPTION_KEY protects recoverable capabilities; development uses an ignored private local key, production invitations fail closed until configured. Keys must be backed up separately. No automatic key-ring rotation, invitation restore, metadata-retention policy, provider delivery or production acceptance is claimed.
- General reads exclude capability material; public invitation reads exclude private contacts and are rate limited/no-store/no-referrer/noindex. The personal-page token is scrubbed and held only in component memory; reopening the original link is required after refresh. Confirmed invalidation hides cached family content. A parent wedding write fence serializes selection with ceremony archive without changing the settings content revision.
- M4A is approved for a commit/push checkpoint on the existing feature branch; Git history records its resulting revision. Preserve BUG_BACKLOG.md and the deferred minor findings; no unrelated fixes are included. Next: agree M4B batch initiation/Sent/delivery/resend policy and controlled provider acceptance before live email.

Independent M4A manual QA on 18 October: browser family creation/validation/edit/search/filters, sharing/copy, selected personal highlights/full schedule, Sent/unique estimates, conflict retention/reload, replacement, referenced ceremony archive and family archive passed on an isolated real Atlas database. Load more expanded 20 cards to all 24. All 17 supplementary HTTP scenarios and five targeted invitation component tests passed; root build passed. No new functional defect was confirmed in the exercised cases. See [MANUAL_M4A_QA.md](./MANUAL_M4A_QA.md) for exact methods and limits. WhatsApp URL/prefill was verified without actual sending; mobile and production/provider acceptance remain separate. Exact temporary database/outbox cleanup completed, and development readiness remained ready.

## M4B development and provider status

19 October 2026: owner added a Resend API key and authorised development. Implemented optional family email, reviewed/confirmed batches, atomic 25-new-family daily reservations, durable encrypted invitation_email jobs, lease fencing, safe original retries, unknown-outcome reconciliation and signed/deduplicated delivery webhook handling. Exact contracts and deliberate baseline extensions are in [EMAIL_INVITATIONS_IMPLEMENTATION.md](./EMAIL_INVITATIONS_IMPLEMENTATION.md).

- Owner explicitly selected no explicit resends. A previously queued family cannot create another dispatch; retries preserve the original recipient/message/key. Sent updates on provider acceptance preserve intervening manual edits/status changes. Outbox does not mark Sent or claim delivery.
- Current private configuration has a key/sender but no explicit live mode, allowlist or webhook secret. Read-only provider `/domains` returned HTTP 401. No key/address was printed and no actual email was sent; provider authentication, verified domain and real delivery remain unverified.
- Root `npm run check` passed: formatting, zero-warning lint, root/package types, all 136 tests across 22 files and production build. Campaign HTTP/service coverage includes 12 tests with mocked provider sends/lookups and signed raw webhook verification.
- Full `npm run test:integration` passed all 26 tests across five real Atlas suites, including six campaign tests. Coverage includes migration partial-run recovery/idempotency, Admin/Manager quota concurrency, confirmation replay, rollback, authority, fenced workers, receipt deduplication and a deterministic webhook/provider-binding race. That race initially reproduced a missed delivery update and passed after adding a shared provider-ID write fence. Temporary database cleanup is awaited.
- Full `npm run test:e2e` passed all five real browser journeys against built assets and isolated Atlas persistence. The new desktop/mobile email journey verifies exact preview/confirmation, private outbox processing, unchanged Sent estimates, disabled repeat selection and persistent batch history. Desktop/mobile screenshots were visually reviewed; checkbox alignment and preview width were improved. The isolated browser database was removed with awaited cleanup.
- `npm run db:migrate` completed through 005 in the verified development database. Private EMAIL_FROM failed configuration validation; the migration used a temporary synthetic sender override only, with no mail or business seed data. The private file was preserved. Final existing-service check found the backend unreachable and the frontend API proxy returned 502. Correct the private sender address and restart development before local QA; this is separate from the passing isolated suites.
- UI/backend changes are local and uncommitted. Existing owner records and deferred bugs are preserved.
- Next: owner QA using the checklist in EMAIL_INVITATIONS_IMPLEMENTATION.md after correcting EMAIL_FROM/restarting development. Resolve the provider authentication check, configure approved live mode/recipients and signed callback settings, then perform controlled provider acceptance. M5 expenses/tasks is the next planned feature after this review. No live mail, production deployment or push is included.

## Latest M4B manual QA

19 October 2026: [MANUAL_M4B_QA.md](./MANUAL_M4B_QA.md) records desktop browser QA against rebuilt assets and an isolated real Atlas/private-outbox server. Reviewed confirmation, stale/expired reviews, history, safe retry and unknown fixtures passed; all 15 supplementary HTTP/Atlas groups passed, including wedding isolation, disabled Manager denial, replay, fixed quota timezone and the 25-family concurrency cap. One new Low/P3 feedback issue is BUG-006. Existing BUG-005 remains open. Root build and targeted client (3) / server (12) tests passed. No actual provider send occurred; mobile override did not work, so this run verifies desktop only. Temporary database/outbox deletion was awaited and the QA listener stopped. Final documentation format/diff checks passed. Next: review both email findings and complete live-provider/device acceptance.

## Temporary UX photography — 20 October 2026

Owner requested using the photographs already shown in the supplied UX design until customer photographs are available. Added ten local JPEG assets from the original public reference sources (about 640 KB total): three couple covers, courtyard, ceremony décor, henna, dancing and invitation stationery. The reference HTML and screenshot placeholders were preserved unchanged.

- Added photography to the landing/auth screens, planning dashboard, family invitation stationery, three theme-selection cards and guest/personal invitation views. Guest pages include theme-specific hero covers, decorative ceremony images and a clearly labelled celebration-inspiration strip.
- Public-facing samples are identified as sample photography; they do not represent actual customer portraits, venue evidence or uploaded memories. Assets are served locally, with no third-party image requests from personal invitation pages. Hero images load eagerly and secondary guest images lazily; fixed aspect ratios reserve layout space.
- `client/src/features/website/demo-media.ts` centralises replacement paths. [Asset provenance and replacement notes](./client/public/images/demo/README.md) map every original reference. Future customer-media integration must use the approved photo lifecycle/access rules; no customer upload, gallery permissions, S3 storage or retention changes are included.
- Original reference images are only 253–512 pixels wide; larger customer originals will improve large-screen sharpness. Browser checks use explicit in-memory persistence/private outbox, not Atlas or live Resend.
- Verification: root `npm run check` passed formatting, zero-warning lint, types, all 136 tests across 22 files and production build. Root `npm run test:e2e:local` passed all five browser journeys. An additional synthetic in-memory browser inspection scrolled to/decode-checked every guest image for all three themes at 1280px and 390px: all images loaded with no horizontal overflow. All ten local assets returned image/jpeg. Reviewed loaded desktop/mobile screenshots, including dashboard, auth, invitation stationery, theme previews and guest themes. Stopped the isolated preview listener after review; no owner database was used.
- Next: owner reviews temporary imagery, then replace it with approved customer photographs when supplied. Preserve all existing M4B changes and deferred bugs.

## Historical scaffold verification record

Verified on 18 October 2026 using Node.js 24.21.0 and npm 11.19.0:

| Check                                        | Result                                                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --offline --cache <temporary-cache>` | Passed: dependency installation reproduced from the lockfile and downloaded cache                                                        |
| `npm run check`                              | Passed: Prettier, ESLint with zero warnings, root/package TypeScript checks, all tests and production build                              |
| Unit/component/HTTP tests                    | 26 passed across four files and three Vitest projects; no Atlas credentials used                                                         |
| Production build                             | Shared ESM/declarations, compiled Express and Vite assets produced successfully                                                          |
| Clean shared-output development start        | Removed output from the startup path by moving it to a temporary directory; `dev:client` rebuilt shared before Vite started              |
| Shared runtime update                        | A temporary source probe recompiled, reached Vite and restarted a backend runtime watch harness; source restored byte-for-byte afterward |
| Real built-asset HTTP smoke                  | Compiled Express served actual frontend assets/deep links; unknown API returned JSON 404 and missing asset returned 404                  |
| Document relocation                          | SHA-256 content checks passed for all five documents during relocation                                                                   |

HTTP tests and smoke checks needed localhost-listener permission outside the execution sandbox. They passed with that permission. Readiness dependencies in these checks were injected substitutes; **Atlas application connectivity, write permissions, schema deployment and external integrations are not verified**. Temporary test listeners and watch processes were stopped after verification. No real local environment file was created.

Dependencies are pinned in package manifests and `package-lock.json`. TypeScript 5.9.3 is selected within the installed TypeScript-ESLint parser's supported range rather than adopting an unsupported compiler release. Installation reported zero known vulnerabilities at this handoff; that is a dated observation, not an ongoing guarantee.

## Document and reference disposition

- The original four planning documents and `MONGODB_DEVELOPMENT.md` moved from `docs/` to the repository root without content edits; their relative links remain valid.
- No React application existed to migrate. `stitch_marriage_suite_ui_design/` contains HTML/Tailwind design references and screenshots; it is preserved unchanged and not imported into the application.
- Some design mockups show RSVP/attendance-response controls, which conflict with version-one scope. Follow the baseline PRD/API rather than implementing those controls.
- The baseline PRD still lists authentication and photo retention/download choices as open. The owner confirmed sessions and the technical documents' retention/export policy in scaffold planning; reconcile baseline prose in a separate future documentation change.

## Known design gaps before affected features ship

1. Complete durable idempotency request fingerprints, replay records and retention; define precise `If-Match` exceptions per endpoint.
2. Specify upload capability/session proof fields consistently between database and API designs.
3. Auth email jobs and encrypted queued envelopes are implemented; extend the jobs validator deliberately for photo/export work later.
4. Signup/password, 24-hour sessions, 48-hour Manager setup and one-hour reset defaults are implemented. Queued-email key replacement requires draining/reconciling jobs; automatic key-ring rotation remains absent. Recoverable family/gallery links remain future work.
5. Choose final theme visuals, HEIC handling, upload limits, provider budgets and retention for audit/job metadata.
6. Auth schema/write/transaction permissions are verified in Atlas; confirm production region/tier, backups and restoration separately.
7. Select hosting and configure the selected Resend provider, proxy trust, production regions, S3 policy/lifecycle and monitoring before pilot deployment.

Recoverable invitation/private-gallery links need a lookup hash plus authenticated encrypted token material for re-sharing. Passwords, sessions and one-use setup/reset tokens remain nonrecoverable. TTL cleanup never determines access validity.

## Next development sequence

The detailed plan is now [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md). The owner supplied a planning scenario of 31 December 2026, invitations beginning 16 November (45 days earlier), 25 per day, and Resend email invitations. This is not a confirmed actual wedding date. Direct family email dispatch extends the previous manual WhatsApp baseline; the implemented M4B contract and owner policy are recorded in EMAIL_INVITATIONS_IMPLEMENTATION.md.

1. Owner reviews the completed auth slice locally and handles staging setup: stable CSRF secret, HTTPS origin/proxy trust, explicit migration, then the signup/login/logout smoke journey. Prepare CI separately.
2. Complete M2 provider acceptance: configure the Resend sender with controlled staging recipients. Atlas integration/default browser checks and the development migration have passed.
3. Review Manager setup/recovery and durable email behaviour over the real staging HTTPS origin; code/local substitute checks alone do not verify external services.
4. M3, M4A and M4B are implemented locally. Owner QA of M4A passed. Next: owner reviews M4B reviewed batches; controlled live dispatch requires corrected private provider/sender settings and staging acceptance. Explicit resends remain disabled.
5. Add expenses and tasks, followed by the complete private photo/moderation/export/retention lifecycle.
6. Add streaming and vendor discovery; complete every version-one pilot scenario before the full release.
7. Stabilise before the hypothetical wedding, monitor during it and verify post-wedding cleanup. Target dates are conditional on capacity and acceptance checks, not guarantees.

The sequence is a roadmap, not a claim that these features exist. Agree detailed feature scope before each milestone.

## Dated development history

### 18 October 2026 — Scaffold authorised and started

- Owner approved the final scaffold plan and requested living progress documentation for future contributors.
- Re-inspected the target folder, identified the design-reference directory, and preserved it.
- Relocated all five planning/setup documents unchanged, verifying SHA-256 before/after each move.
- Began the fresh three-package scaffold and created README/status handoff documentation.
- Dependency installation and verification were pending at this starting checkpoint; completion is recorded in the following entry.

### 18 October 2026 — Scaffold completed and verified

- Installed and pinned dependencies, created the root lockfile and reproduced installation with `npm ci` from a local download cache.
- Completed the React/CSS Modules shell, Express foundation, MongoDB connectivity adapter, shared exports, test projects and production routing boundaries.
- Verified the full `npm run check` command: all 26 tests passed, with lint, type checking, formatting and production build successful.
- Verified clean shared-output startup, runtime contract propagation/restart, and serving the real production frontend using temporary local smoke harnesses; no Atlas access was attempted.
- Added `AGENTS.md` to require progress-document updates on future meaningful changes, plus this handoff and the root README.
- Preserved baseline document contents and all design references. No business features, schemas, seeds, deployment or production-service credentials were introduced.
- Next action: configure the private development connection, then plan the authentication/wedding-isolation and migration milestone.

### 18 October 2026 — Diagnosed development proxy refusal

- Reported symptom: Vite could not connect to `127.0.0.1:3000` for `/api/v1/health/ready`.
- Confirmed `server/.env` was absent. Direct backend startup reproduced a sanitised configuration failure naming `APP_ORIGIN`, `MONGODB_URI` and `MONGODB_DB_NAME`; the backend did not open an HTTP listener.
- Added README troubleshooting for frontend-only mode, private environment setup, combined development startup and Atlas connection failures.
- No application-code change or Atlas connection was needed for this diagnosis. Startup remains blocked until private development configuration is supplied locally; Atlas connectivity is still unverified.
- Verification: reproduced the backend startup failure; documentation formatting checked. The earlier scaffold test/build results above remain historical results, not a new run for this documentation change.

### 18 October 2026 — Updated Atlas connection and deployment guide

- Updated `MONGODB_DEVELOPMENT.md` to the current cluster `marrige-suite.2ytx40z.mongodb.net` and database user `saurabhsunny`; the previous connection is marked superseded.
- Compass authentication was verified in this chat on 18 October 2026; visible databases were admin, config, local and sample_mflix. Application connectivity, write permissions, schemas and production setup remain unverified.
- Documented actual backend environment variable handling, private deployment secrets, separate production database/user placeholders, build artifacts and health verification steps. Passwords remain excluded.
- Verification: reviewed the guide against server configuration, MongoDB adapter and README; checked Markdown links and formatting. No application tests, deployment or database mutations were performed for this documentation update.
- Next action: configure the private development environment and verify application readiness; select and provision production resources before deployment.

### 18 October 2026 — Application running; development branch checkpoint

- Owner reports the backend is working and the application is running. This supersedes the earlier missing-configuration blocker; independent connectivity/write-permission checks were not performed for this checkpoint.
- Owner requested a development branch and a local commit of the scaffold, excluding `docs/` and `stitch_marriage_suite_ui_design/`.
- Added root ignore rules for those two directories; preserved their local contents. Root planning documents, README and this progress log are included in the checkpoint. Private environment files, dependencies and build outputs remain ignored.
- Repository had no prior commits. Prepared the initial scaffold checkpoint on `develop`; no remote push is included.
- Verification for this checkpoint: documentation formatting and Git staging/content checks. The earlier 26-test scaffold verification remains recorded above; application tests were not rerun for documentation/ignore-rule changes.

### 18 October 2026 — Development and deployment roadmap created

- Owner requested a feature/deployment roadmap based on `stitch_marriage_suite_ui_design/`.
- Reviewed the design system, HTML screens and available valid screenshots. Recorded RSVP/confirmed-count, guest-cap/access-pass, WhatsApp-delivery and theme-naming conflicts; three screenshot files contain text rather than image data. Reference files remain untouched.
- Owner supplied a tentative 31 December wedding scenario, invitation sending 45 days earlier at 25 per day, and Resend for email invitations. Assumed 2026 based on the current planning date; computed the first batch as 16 November 2026. Total family count and automatic versus team-triggered sending remain open.
- Created `DEVELOPMENT_ROADMAP.md` with dated target milestones, a first complete account/wedding journey, invitation-release criteria, later full version-one delivery, Resend contract additions, staging/production promotion and rollback guidance.
- Recommended team-confirmed daily batches, explicit provider-accepted versus delivered states, durable per-family dispatch/idempotency records and early job infrastructure. These are planning recommendations, not implemented endpoints or sent emails.
- Added roadmap links to README/status. No application code, baseline planning document, dependencies, schema, workflow or deployment was changed; no commit/push was performed.
- Verification: calendar arithmetic and source/reference review; Markdown formatting and local-link checks. The earlier scaffold tests remain historical; application tests were not rerun for this documentation-only work.

### 18 October 2026 — First authentication slice scoped; development startup attempted

- Owner will handle deployment and requested guidance on starting with signup, login and logout.
- Re-read the PRD/API/database authentication boundaries. Created `AUTH_IMPLEMENTATION_PLAN.md` for transactional wedding/Admin signup, CSRF, sessions, login/me/logout, a protected dashboard shell, migrations and acceptance checks. Session/password settings in that plan are proposed defaults, not implemented configuration.
- Started `npm run dev` using the existing private environment file. Vite reached ready on port 5173; backend Atlas connection failed before listening on port 3000. A separate read-only ping reproduced a sanitised TLS-related `MongoServerSelectionError`. No credentials were exposed and no schema/data changes were attempted.
- This latest agent runtime check is distinct from the owner's earlier successful application run; the exact TLS/network/provider cause is not established. Live database integration checks remain pending. TLS validation was not relaxed.
- Linked the auth plan from README/status. No authentication code or dependencies, migrations, deployment, commit or push was introduced in this planning step.
- Verification: source/contract review, startup/ping diagnosis, Markdown formatting and local document links. Earlier scaffold test results remain historical; application tests were not rerun for this documentation-only change.

### 18 October 2026 — Atlas failure narrowed to IP access-list mismatch

- Compared private runtime configuration with the documented cluster/user/authSource without exposing the URI/password. Settings matched, placeholders were absent and no shell override or TLS-validation bypass was configured.
- DNS resolved all three Atlas nodes; TCP connections to port 27017 succeeded. Both default TLS and TLS-1.2-only probes were rejected with `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`; the MongoDB ping failed before database authentication.
- Read the existing Atlas project's IP Access List through the user's open browser session. Its sole active `/32` rule did not match the machine's current public outbound IP checked through AWS. This is the leading explanation for previously successful access followed by TLS rejection; confirm through an authenticated retry after a narrow authorised rule update.
- Opened and cancelled the add-entry form without saving. No Atlas rule, credential, database record, application code or TLS setting was changed. Client IP values are intentionally omitted from committed documentation.
- Added targeted troubleshooting to MongoDB setup/README and the auth plan. Validation: read-only configuration/DNS/TCP/TLS/ping checks plus Markdown formatting/links; no application test rerun was needed for documentation-only changes.
- Next action: update Atlas access for the current client IP, then retry the application ping and backend readiness. Do not grant access from all IPs or disable certificate validation as a workaround.

### 18 October 2026 — Atlas connectivity restored and readiness verified

- Owner added the current client IP as a narrow Atlas access entry and reported it Active. No access-rule changes were made by the agent.
- Re-ran the existing application MongoDB adapter with the private development configuration: connection, ping and readiness callback succeeded without disabling TLS or changing credentials. This confirms the earlier IP access-list mismatch caused the TLS rejection.
- Restarted the development command. Express started on port 3000; Vite is running at `http://127.0.0.1:5173/`.
- Verified HTTP 200 from direct `/api/v1/health/ready`, the same route through the Vite proxy, and the frontend page. Both readiness responses reported `ready`.
- Updated MongoDB setup notes and auth-plan runtime history. These are connectivity checks only: no database writes, migrations, schema deployment or write-permission tests were performed. Authentication remains planned, not implemented.
- Verification: successful live read-only ping and HTTP checks, documentation formatting/links. Earlier unit/build results remain historical; application code was unchanged. Development services remain running for the owner.

### 18 October 2026 — Signup, login and logout implemented

- Owner approved the first implementation. Added strict shared auth contracts, Argon2id passwords, opaque MongoDB-backed sessions, safe identity responses, CSRF/origin protection, fixed-window MongoDB rate limits and consistent error handling.
- Signup creates a draft wedding, sole Admin, session and audit record atomically. Implemented date/timezone retention initialisation and slug collision handling; role and wedding ownership are never client-controlled. Login rotates the browser session; expiry/revocation/current user state are checked independently of TTL. Logout revokes the current session.
- Added responsive two-step signup, login and protected dashboard using CSS Modules, React Hook Form/Zod and existing Query/Router setup. Refresh resolves server identity; logout/account changes clear private cached data and notify other tabs. No tokens/passwords are persisted in browser storage.
- Added explicit migration command/history with an owner-held migration lock. Created only auth-related collections/validators/indexes; no automatic schema changes on startup. Applied this schema to the development database without seeding accounts. Added required production CSRF secret and configurable session lifetime examples; existing private environment values were preserved.
- Verification: full `npm run check` passed with 45 tests; four isolated real Atlas integration tests passed; one real desktop/mobile Playwright journey passed, including keyboard navigation. Screenshots reviewed. Added awaited Playwright cleanup after identifying and removing two leftover browser-test databases. A later browser retry encountered changed-IP Atlas TLS rejection; final live recheck remains pending current-IP access. Earlier existing development services returned readiness 200 and expected anonymous auth responses; duplicate dev startup was not kept running.
- Updated README, API/database implementation notes, auth acceptance and roadmap/status handoff. Preserved UX references and earlier history. No deployment or Git commit/push performed.
- Next action: owner reviews `/signup` → dashboard → sign out → `/login`, then stage the feature with explicit migration/HTTPS secret settings. Implement account recovery and Manager access with controlled Resend email next.

### 18 October 2026 — Manual authentication QA after connection repair

- Owner reported fixing the database connection. Independently confirmed development readiness and the browser's connected state.
- Manually exercised the current built application through the existing isolated Atlas test server: signup validations and step navigation, successful registration, session refresh, signed-in redirects, logout, cross-tab logout, browser Back protection, unknown/wrong/correct login and duplicate registration.
- Confirmed duplicate registration left exactly one synthetic user and wedding, with zero unrevoked sessions after final logout. Stopped only the QA server and awaited guarded cleanup of its exact temporary database; development data/services were preserved.
- Recorded two minor UX findings in `MANUAL_AUTH_QA.md`: technical missing-date wording and duplicated email-conflict feedback. No application fixes were made.
- Verification: `npm run build` passed; browser observations and direct isolated persistence counts passed. Mobile override did not apply, so this run does not verify mobile layouts. Earlier automated suite results remain historical; no production verification, deployment, commit or push was performed.
- Next action: improve the two feedback messages and repeat mobile/device QA before staging acceptance.
- Documentation check: root `npm run format:check` reported three unrelated access-feature formatting failures (`server/src/modules/access/access.repository.ts`, `server/src/modules/access/access.types.ts`, `shared/src/access.ts`); left those concurrent files untouched. Targeted formatting of the two QA documents passed. Final development readiness remained `ready` after cleanup.

### 18 October 2026 — Manager invitations and password recovery implemented

- Owner authorised M2, then asked to resume after resets. Checked Git state: authentication baseline and in-progress files were present. Preserved the separate manual auth QA document/status history and design references.
- Added shared access contracts, transactional MongoDB repositories, migration 002, Admin-only Manager invitation/resend/revoke and enable/disable APIs, one-use Manager acceptance and password reset. Added team/setup/recovery screens with local error/loading/empty states, pagination, revision handling and private session-cache updates.
- Added private outbox/Resend transports, authenticated encrypted queued message envelopes, durable lease/version-fenced jobs, bounded provider-idempotent retries and shutdown handling. Auth-token TTL follows the baseline; existing permissions, wedding isolation and photo retention remain unchanged. Real mail requires explicit configuration; no external messages were sent.
- Added credential-free HTTP/service/worker/transport/schema/UI checks, six real-Atlas acceptance tests, and a browser team/recovery journey. Added an explicit local substitute browser command; default integration/browser paths still require Atlas.
- Verification: final `npm run check` passed all 76 tests across 12 files, formatting, zero-warning lint, type checks and production build. Client suite and two local browser journeys passed; screenshots reviewed. Real Atlas integration setup failed before all 10 tests could execute. No development migration, external email, deployment, commit or push performed.
- Updated README, roadmap, API/database/architecture implementation notes, example configuration and TEAM_RECOVERY.md. Next: real Atlas migration/integration/default-browser checks and controlled Resend staging acceptance.

### 18 October 2026 — Atlas-backed M2 acceptance and development migration

- Owner reported updating Atlas network access. Confirmed development readiness, all 10 real integration tests and both real Atlas browser journeys; test databases/outboxes were cleaned up by guarded teardown.
- Fixed an ambiguous browser-test selector exposed by slower real database loading: select the intended Admin success status rather than all loading/success statuses. No application behaviour change.
- Verified the development migration target and applied auth/team-recovery migrations with root `npm run db:migrate`; no business data was seeded. Existing services remained ready, and anonymous proxied team access remained denied (401).
- Updated the status, README, roadmap and team/recovery guide to distinguish real Atlas success from still-unverified external email/production settings. Final root `npm run check` passed formatting, zero-warning lint, types, all 76 tests and production build; `git diff --check` passed.
- Next: controlled Resend staging delivery and HTTPS/session/proxy acceptance; then wedding website/events/themes. No real email, production changes, commit or push.

### 18 October 2026 — Owner requested M2 checkpoint and next milestone

- Owner deferred personal feature review and authorised committing/pushing the completed changes, then starting M3. This is not owner acceptance of the deferred UI walkthrough or live Resend delivery.
- Reviewed the intended working-tree files, kept private environment/outbox/build artifacts excluded, and retained the manual auth QA notes. The latest full root check, 10 real Atlas tests and two Atlas browser journeys remain the validation evidence for this checkpoint.
- Next: checkpoint M2 on develop, then implement wedding content, ceremonies, private preview/publication and three existing theme variants on a feature branch. No production deployment is included.

### 18 October 2026 — M2 pushed; M3 implementation underway

- Created M2 commit `27d396a` and pushed it to origin/develop through GitHub Desktop after terminal HTTPS authentication was unavailable. Verified local HEAD and origin/develop matched. Private environment/outbox/build files and reference designs were excluded.
- Created feature/wedding-website-events from that checkpoint. Owner explicitly asked to proceed while deferring personal M2 review; no live Resend acceptance is inferred.
- Added in-progress wedding/event contracts, migration 003, transactional wedding/event mutations, public projections, revision/retention guards, settings/ceremony editors, private preview/publication, three guest theme presentations, 25-second refresh and escaped HTML metadata. Managed covers remain decorative fallbacks until the photo lifecycle milestone; streams remain M7.
- Initial types/lint passed after interface alignment. Runtime tests found a refined-schema response construction issue; corrected the public event projection schema. New HTTP/schema/UI/Atlas/browser checks are in progress; M3 is not yet a completed or deployed milestone.
- Next: finish validation, address failures, review responsive screens, apply the development migration only after real Atlas tests pass, and document actual acceptance results.

### 18 October 2026 — M3 website/events implemented and Atlas verified

- Added wedding/event contracts, explicit migration 003, transactionally revisioned wedding/event/audit changes, public projection/retention/slug guards and reference-aware archiving. Admin and Manager permissions and wedding isolation are preserved.
- Added accessible settings/ceremony editors, a private saved preview and explicit publication/unpublication. Built Traditional/Floral/Minimal guest presentations sharing one model, manual status/today/upcoming views, 25-second/focus refresh, announcements, map/call actions and escaped published HTML metadata. Unpublished page responses use a generic shell without wedding metadata; no private data enters public projections.
- Reused pinned Luxon in the frontend for wedding-timezone inputs, with explicit DST-gap/ambiguity errors. Split M3 routes to keep the initial bundle small. Retained decorative covers and null streams until their lifecycle milestones.
- Verification: final root check passed all 100 tests plus formatting/zero-warning lint/types/build; all 15 real Atlas integration tests and three Atlas browser journeys passed. Reviewed desktop settings/preview and all three mobile guest themes. The final targeted Atlas browser rerun also passed; its desktop ceremony editor screenshot was reviewed. Development readiness returned ready after the build/watch restart; anonymous proxied event access was denied with 401.
- Applied tested migrations through the root command to the verified development database; no business data was seeded. Preserved M2 owner-review/Resend limits, manual QA notes, private config/outbox exclusions and reference designs. M3 remains local to the feature branch, with no production release or M3 commit/push.
- Updated README, API/database notes and WEBSITE_IMPLEMENTATION.md. Next: owner review and staging/provider prerequisites, then M4 family invitation work.

### 18 October 2026 — QA publication-return revision fix

- QA reported settings still showing “Draft · private” after publication, followed by a false revision conflict; explicit reload recovered it. QA also confirmed intentional two-tab conflicts retained unsaved text. Themes/team/recovery acceptance is still underway.
- Preview now cancels any in-flight settings read and caches the successful publication response before invalidation/navigation. The settings editor starts from the acknowledged status/revision; background updates still do not silently replace unsaved edits or bypass genuine revision checks.
- Added a route-level regression with a delayed settings GET (failed before the fix, passed after) and browser assertions for returning through the settings link, saving after publication, two-tab conflict text retention and explicit reload recovery.
- Verification: client suite passed 20 tests; final root `npm run check` passed all 101 tests across 15 files, formatting, zero-warning lint, types and production build. An initial test fixture omitted the required request ID; corrected before the successful full check.
- Browser verification: the website journey passed against built assets with in-memory test stores, including post-publication status/save, two-tab conflict text retention/reload, three themes, live updates and unpublication. The sandbox initially blocked the test-server socket; the usual port 3101 was already occupied, so an isolated temporary configuration used port 3102. Temporary files/outbox were cleaned up and the existing QA server was preserved. This run does not verify Atlas or real email.
- No permissions, wedding isolation, retention or scope change. No real email, development migration, deployment, commit or push. Next: owner retests the fixed flow and completes themes/team/recovery QA.

### 18 October 2026 — Manual M2/M3 QA and publication-fix regression verified

- Tested current local feature-branch work through the existing isolated Atlas/browser server and private temporary outbox. Exercised signup/login/logout, Manager invitation/resend/revoke/accept and role privacy, disable/re-enable, website settings, three desktop themes, ceremony validation/status/archive, preview/publication/live changes, unpublication and stable addresses. Supplemented browser observations with 19 direct HTTP scenarios covering token expiry/reuse/replacement, password reset/session revocation, anonymous access and two-wedding isolation.
- Reproduced stale draft settings after publishing. The owner supplied the fix during QA; rebuilt and independently verified Publish → return to settings → immediate save with no reload/conflict, plus the saved guest content. Genuine two-tab conflicts still retained entries. No application code was edited by this QA session.
- Verification actually run here: root build passed before/after the fix, targeted website component tests passed seven tests. Full-suite results recorded by the implementation remain separate historical evidence. See MANUAL_M2_M3_QA.md for browser-versus-HTTP coverage, harness corrections and unverified cases.
- Recorded remaining minor signup wording/feedback and last-ceremony archive guard wording. Mobile resize remained 1280px despite the requested override; mobile layout and independent focus-return/timer measurements are not claimed. No real Resend/production acceptance, deployment, commit or push occurred.
- Stopped only the isolated QA server and explicitly awaited exact temporary database/outbox cleanup. Preserved development data/config/services and design references. Next: remaining UX copy, mobile/focus-return QA and controlled staging/provider acceptance.
- Documentation validation: root `npm run format:check` and `git diff --check` passed for the QA handoff.

### 18 October 2026 — M3 GitHub Desktop checkpoint preparation

- Owner approved committing and pushing M3 on `feature/wedding-website-events` using GitHub Desktop. The checkpoint includes wedding settings, ceremonies, preview/publication, guest themes, the publication-return cache regression fix, implementation documentation and the manual M2/M3 QA report.
- Re-ran root `npm run check`: passed formatting, zero-warning lint, root/package types, 101 tests across 15 files and the production build. `git diff --check` passed. Previous Atlas/browser results remain historical; they were not rerun for this Git-only handoff.
- No production deployment, live email, permissions or scope changes. Remaining minor QA findings and provider/staging acceptance are preserved above and in MANUAL_M2_M3_QA.md. Next: complete those acceptance items, then agree M4 details. Git history and the remote branch record the resulting commit/push outcome.

### 18 October 2026 — Deferred bug backlog documented

- Owner requested documenting the noncritical findings for later review instead of fixing them. Added BUG_BACKLOG.md and a README link: three open Low/P3 bugs, known versus unconfirmed causes, reproduction/workaround/acceptance details and the verified publication regression retained as closed history.
- Recorded pending QA, CI and external-service/operational acceptance separately; untested scenarios are not labelled as product defects. Confirmed the duplicate-email rendering path by code inspection. No application fix, permission, retention or product-scope change.
- Recorded the completed M3 GitHub Desktop checkpoint: commit `3c68675` pushed to `origin/feature/wedding-website-events`. Preserved earlier history and its verification limits.
- Documentation checks: root `npm run format:check` and `git diff --check` passed. Application/Atlas/browser/provider checks were not rerun for this documentation change. Next: review deferred items when scheduled; agree M4 family/invitation details independently, retaining staging/provider acceptance before live release.

### 18 October 2026 — M4A manual family invitations implemented and verified

- Added shared invitation contracts, explicit migration 004, wedding-scoped MongoDB persistence and transactional authority/revision/audit handling. Separate version-bound authenticated encryption permits stable re-sharing without exposing capability material in normal reads. The parent wedding fence serializes selections with ceremony archive across distinct team members.
- Added `/invitations` with family/contact editing, selected active ceremonies, literal search, filters/cursors, share/copy/WhatsApp actions, manual Sent tracking, confirmed rotation/archive and unique 2–3-person estimates. Personal invitation pages show selected dates/venues/contacts first and the full schedule below; capabilities stay in memory, with scrubbed addresses, generic invalidation and private-contact omission.
- Verification: full root check passed 119 tests across 19 files, formatting/zero-warning lint/types/build; real Atlas integration passed 20 tests; all four Atlas browser journeys passed. Final presentation-specific browser rerun and the strengthened five-test Atlas suite (Admin/Manager archive race) passed. Reviewed desktop/mobile screenshots and awaited temporary database/outbox cleanup. Fixed the new partial-patch default and rotation contract issues exposed during implementation; preserved all deferred prior bugs.
- Applied migrations 001–004 through the root command to the verified development target, without seeding business records. Final backend readiness was ready; anonymous proxied invitation access returned 401. Sandbox-blocked initial attempts are distinguished from actual successful external checks above.
- Updated README, API/database/architecture/roadmap notes and INVITATIONS_IMPLEMENTATION.md. Root formatting and diff checks passed for the final handoff. No real email/WhatsApp dispatch, production deployment, new commit or push. Next: owner QA of M4A, then agree M4B email policy/provider acceptance; maintain BUG_BACKLOG.md for later polish.

### 18 October 2026 — Independent manual families/invitations QA completed

- Tested the current local M4A working tree on feature/wedding-website-events with built assets, real isolated Atlas persistence and synthetic weddings/families. Exercised the complete Admin family/share/Sent/link-replacement/archive journey and reference-aware ceremony archive integration. No owner wedding was populated or published.
- Verified two overlapping Sent families count once each: 4–6 overall, with correct per-ceremony ranges; unsent families and re-sharing did not inflate counts. Not sent and archive removed contributions. Private contacts were omitted from personal views/messages, and old/archived links failed.
- Verified stale family edits retain entries and explicit reload recovers them; literal/contact search, Sent/ceremony filters, no-match state and browser Load more over 24 families passed. Supplementary HTTP checks covered Manager authority, cross-wedding/anonymous denial, private headers/projections, stable sentAt, selection/revision boundaries and scoped pagination.
- Checks actually run: root build passed, targeted invitation client suite passed five tests, and 17 supplementary HTTP scenarios passed. Historical full-suite/Atlas integration/automated browser results remain separate. No new functional defect confirmed; no application fix, migration to development, commit/push or deployment performed.
- Recorded MANUAL_M4A_QA.md with methods/limits. Desktop only; actual WhatsApp dispatch, mobile/device and provider/production acceptance were not performed. Preserved deferred bugs and design references. Stopped only the isolated QA server and awaited exact database/outbox cleanup; final owner development readiness returned ready.
- Next: owner reviews QA results, completes outstanding device/operational acceptance and agrees M4B policy before email dispatch.
- Updated QA-006 backlog evidence for the verified family/reference cases. Documentation validation: root `npm run format:check` and `git diff --check` passed for the QA handoff.

### 18 October 2026 — Owner M4A acceptance and GitHub Desktop checkpoint

- Owner confirmed manual QA verified M4A and the feature works, and explicitly requested commit/push through GitHub Desktop. This acceptance covers the implemented manual-sharing slice; family email dispatch and production/provider acceptance remain separate.
- Reviewed the pending implementation, migration, contracts, tests and documentation, including MANUAL_M4A_QA.md and BUG_BACKLOG.md. Re-ran root `npm run check`: formatting, zero-warning lint, root/package types, all 119 tests across 19 files and production build passed. Final documentation formatting and `git diff --check` passed; Atlas/browser suites were not rerun for this Git-only handoff.
- Prepared the approved checkpoint on `feature/wedding-website-events`. Git history and the remote branch record the resulting commit/push outcome. No production deployment, real email/WhatsApp dispatch or deferred-bug fix is included. Next: agree M4B sending policy and controlled staging/provider acceptance.

### 19 October 2026 — M4B development started

- Added optional family email and the batch/worker/webhook foundation with reviewed immutable messages, atomic quota reservations and no explicit resends per owner choice. Added Svix 2.8.0 from npm for raw-body signature verification; existing auth email transport keeps its string-returning send contract while family email uses provider receipts.
- Added migration 005 and explicit API/database contract notes through EMAIL_INVITATIONS_IMPLEMENTATION.md. Initial 11 campaign HTTP tests and five targeted Atlas tests passed. Full checks/browser verification are in progress; no development migration is yet claimed.
- A read-only Resend check returned 401. Existing unset EMAIL_MODE still selects private outbox; no test-recipient allowlist/webhook secret is configured and no real email was sent. Continue unaffected development while live-provider acceptance remains pending.

## Update checklist for every development handoff

- Update the date, milestone and affected tracker rows.
- Describe implemented behaviour and link relevant code/docs when useful.
- Record tests/checks actually run, their outcomes and any unverified external dependencies.
- Record new decisions, baseline conflicts and operational limitations without secrets.
- Append a dated history entry; preserve earlier entries.
- Leave the next contributor a concrete next action.

### 19 October 2026 — M4B implemented and verified locally

- Implemented optional contact email, exact batch preview/confirmation, atomic 25-new-family daily reservations, per-family outcomes/history, encrypted durable jobs, stable-key bounded retries, signed deduplicated delivery callbacks and exact provider-record reconciliation. Both team roles retain wedding isolation and transactional authority checks. Owner chose no explicit resends.
- Reproduced and fixed the receipt/provider-binding transaction race using a shared provider-ID write fence. Added coverage for expired/forged raw signatures, unrelated signed event types, migration recovery, concurrent quotas, confirmation replay, rollback, disabled authority, stale content/leases, safe retries and preserved intervening manual status changes.
- Checks: root `npm run check` passed 136 tests across 22 files plus formatting, zero-warning lint, types and production build; all 26 real Atlas integration tests across five suites passed; all five real Atlas browser journeys passed. Desktop/mobile screenshots reviewed, temporary database cleanup awaited. `npm run db:migrate` applied through 005 to verified development, without business seed data. Final documentation formatting and `git diff --check` passed.
- External limits: read-only Resend `/domains` returned HTTP 401; no real send occurred. Private EMAIL_FROM is invalid and was preserved; the migration used a temporary synthetic sender override. Existing local backend is unreachable and frontend API proxy returns 502 until private configuration is corrected/restarted. Outbox tests and mocked provider calls do not verify live acceptance/delivery.
- Updated README, API/database/architecture/roadmap notes and EMAIL_INVITATIONS_IMPLEMENTATION.md including manual QA cases. No deferred-bug fix, production deployment, commit or push. Next: correct private settings, owner QA/controlled provider acceptance, then agree M5 expenses/tasks scope.

### 19 October 2026 — M4B review finding deferred as BUG-005

- Owner requested adding the reviewed P2 finding to the bug list. Recorded BUG-005 (Medium/P2): a content change after an uncertain provider attempt marks the dispatch cancelled and prevents application reconciliation. Added reproduction, evidence limits, workaround and regression acceptance criteria; no application behaviour was changed.
- Review evidence: root `npm run check` passed formatting, zero-warning lint, types, 136 tests and production build. A separate local compiled-code harness with synthetic store/mocked transport reproduced queued timeout → wedding edit → cancelled → reconciliation rejected. Real provider acceptance was simulated; Atlas, browser and live Resend checks were not rerun for this review.
- Documentation checks: root `npm run format:check` and `git diff --check` passed. Next: schedule BUG-005 recovery-state handling and regression coverage while preserving exact provider matching, no-resend protections and manual family changes. No fix, migration, real email, deployment, commit or push performed.

### 19 October 2026 — Manual M4B QA completed

- Exercised current uncommitted reviewed family email batches using built assets, isolated real Atlas and private outbox. Added MANUAL_M4B_QA.md separating manual browser journeys, 15 supplementary HTTP/Atlas checks, controlled failure/expiry fixtures and provider mocks.
- Core exercised outbox flows passed. Daily reservations and jobs reached 25 with zero Sent families; confirmation replay, cross-wedding denial and disabled Manager checks passed. Recorded new Low/P3 BUG-006 for misleading malformed provider-ID feedback; preserved deferred Medium/P2 BUG-005 and all prior history.
- Root build passed; targeted campaign client tests passed 3 and server tests passed 12. Server tests required a permitted rerun after sandbox listener EPERM. Root documentation formatting and diff checks passed. Historical full-root/Atlas/browser suites were not rerun in this manual pass.
- Stopped only the isolated QA listener and awaited exact temporary database/outbox cleanup. No owner data, application code, private settings, actual email, commit, push or deployment changed. Live provider and manual mobile acceptance remain unverified; next review findings and complete controlled acceptance.

### 20 October 2026 — Temporary reference photography added

- Owner authorised reusing UX reference photographs until customer media is supplied. Added ten locally served sample assets and a central replacement manifest, preserving all reference material and unrelated uncommitted M4B/manual-QA work.
- Updated landing/auth, dashboard, invitations, theme previews and all guest themes with responsive images; added sample labels and a static inspiration strip. No functional gallery, upload, customer data, permissions or retention behaviour changed.
- Verification: root `npm run check` passed 136 tests across 22 files plus formatting/lint/types/build; `npm run test:e2e:local` passed all five existing journeys. Supplemental synthetic browser inspection confirmed all three themes load their images after scrolling at desktop/mobile widths without overflow; all ten static JPEG requests passed. Screenshots visually reviewed; isolated in-memory review listener stopped. Final formatting and diff checks passed.
- Atlas/live Resend were not rerun for this visual change. No migration, customer data, real message, commit, push or deployment performed.

### 22 October 2026 — Connectivity diagnosis and remaining-feature plan

- Owner requested adding the current network IP, verifying application connectivity and listing/ordering all pending development. Preserved existing uncommitted M4B/media/application work and reference designs.
- Read README/status and product/architecture/database/API/MongoDB baselines; compared current source modules, implementation notes and bug register. Updated DEVELOPMENT_ROADMAP.md with an ordered remaining-work inventory, dependencies and acceptance gates; corrected its stale next-feature statement. No application features were changed.
- Verification actually run: private configuration validation passed; unsandboxed read-only Atlas ping failed with MongoServerSelectionError; backend port 3000 was unavailable; frontend-proxied readiness on port 5173 returned 502. The sandbox-only network probe was inconclusive and is superseded by these unsandboxed results. Prior successful Atlas/test results above remain historical evidence.
- Atlas browser session redirected to login after its security view stalled. Requested owner sign-in to inspect the active network list. IP mismatch is plausible from history but not confirmed today. No Atlas access-list change, database write/migration, credential/TLS change or provider send was performed.
- Next: finish Atlas sign-in/access inspection, prepare the narrow current-IP entry and verify application ping/readiness after the authorised update. Then schedule invitation/provider/staging acceptance and begin M5 expenses/payments, followed by tasks/overview; implement the entire photo lifecycle before enabling photos, then streaming/vendors and full pilot QA. Deferred bugs remain open; no fix is claimed.
- Documentation validation: root `npm run format:check` and `git diff --check` passed after formatting the updated documents and removing a new trailing-space marker. No application/unit/integration/browser suite was rerun for this documentation-only change; no deployment, commit or push.

### 22 October 2026 — Atlas access restored and application rechecked

- Owner completed Atlas sign-in. The selected project containing the documented development cluster displayed its current-IP-added confirmation; no access-list edit was performed by the agent. The earlier session had shown another project's signed-out view. No credentials or current IP were copied into documentation.
- The application MongoDB adapter connected, pinged and passed its readiness callback with normal TLS/private development configuration. Configuration validation passed and email remained in outbox mode.
- Ran root `npm run dev:server`; shared compilation passed and triggered the existing development watcher to reconnect. The extra backend process hit the occupied port, so stopped only the newly started command. Preserved the existing healthy listener/frontend.
- Verified direct port-3000 and frontend-proxied port-5173 readiness returned HTTP 200/ready, with anonymous `/api/v1/auth/me` returning 401 through both. Reloaded the browser login page and confirmed the sign-in form rendered.
- No database writes/migrations, real email, production changes or feature implementation were performed. This verifies connection/readiness and anonymous protection only; prior schema, feature and integration results remain historical.
- Next: use the restored local application; continue the ordered roadmap with invitation/provider/staging acceptance and M5 expenses then tasks. Documentation formatting/diff checks passed. No commit/push.

### 22 October 2026 — Owner saved temporary all-IPv4 Atlas access

- Owner explicitly requested temporary `0.0.0.0/0` network access after recurring dynamic-IP interruptions. Prepared the Project 0 access-list entry with one-week automatic expiry; owner saved it in Atlas. Independently observed the entry Active, with scheduled deletion on 29 October 2026 at 13:04:35 Asia/Kolkata.
- This is an explicit temporary exception to the earlier narrow-IP operational guidance: any IPv4 source can attempt a database connection while the rule exists. Database credentials, TLS, application permissions, wedding isolation and retention remain unchanged. Existing narrow entries were preserved. No credentials or client IP values are recorded here.
- Verification: a fresh connection through the application MongoDB adapter, ping and readiness callback passed; direct backend and frontend-proxied readiness both returned HTTP 200. This does not establish connectivity from another network or prove schema/write acceptance anew.
- Next: replace the temporary broad entry with stable approved application egress/narrow access before expiry or production release. Dynamic-IP restrictions can recur after automatic deletion if the current address is not covered by a remaining entry.
- No application code, database records/migrations, provider sends, production deployment or Git commit/push changed. Documentation formatting and diff checks passed.

### 22 October 2026 — Owner authorised GitHub Desktop checkpoint and expenses development

- Owner requested committing/pushing the pending work through GitHub Desktop before developing the next feature. Reviewed the 62 pending files: M4B reviewed email batches, sample reference photography, QA notes and updated connectivity/roadmap documentation. Private environment/local outbox/build artifacts and reference designs remain excluded.
- Fresh root `npm run check` passed formatting, zero-warning lint, types, all 136 tests across 22 files and production build. This is credential-free verification; historical Atlas/browser results and live email limitations remain unchanged.
- Next feature authorised: M5A expenses and payments, including precise INR amounts, payment history, explicit outstanding/overpaid balances, event/category/payer filters, revision/idempotency protection and wedding isolation. Tasks remain the following feature.
- Commit/push result will be recorded after GitHub Desktop completes. No production deployment or provider send is included.
