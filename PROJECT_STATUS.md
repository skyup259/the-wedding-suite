# Project status and development handoff

Last updated: 18 October 2026 (Asia/Kolkata).

This is the living entry point for a new contributor. It records actual implementation progress, decisions, verification, limitations and the next development steps. Read [README.md](./README.md) for commands and setup, then the linked baseline documents for product details.

## Current milestone

**M2 implemented: Manager invitations, team access and password recovery, with durable auth-email processing. Real Atlas checks and the development migration passed; controlled Resend acceptance is pending.**

The owner approved authentication and then M2 implementation on 18 October 2026. Registration creates one draft wedding and its sole Admin atomically, signs in, and opens a protected dashboard showing real account/wedding details. `/login`, `/signup` and `/dashboard` are available. The private query cache is cleared on logout/account changes, and sessions are restored after refresh.

See [TEAM_RECOVERY.md](./TEAM_RECOVERY.md) for M2 behaviour, configuration and acceptance limits; [AUTH_IMPLEMENTATION_PLAN.md](./AUTH_IMPLEMENTATION_PLAN.md) records the first slice, [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) records the remaining sequence. Deployment is handled by the owner; no hosting, real email dispatch or production release was performed.

## Confirmed architecture and product decisions

| Area        | Decision                                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application | Modular monolith; React/TypeScript/Vite frontend; Express/TypeScript backend                                                                               |
| Repository  | npm workspaces: client, server, shared; ESM; CSS Modules and CSS variables                                                                                 |
| Database    | MongoDB Atlas with official driver; separate development/production configuration; no Docker                                                               |
| Access      | Email/password and MongoDB-backed opaque sessions implemented; Admin/Manager accounts belong to one wedding; Guests have no accounts                       |
| Production  | Same-origin API and frontend; hosting provider undecided                                                                                                   |
| Photos      | Private S3; approved public and private-family views; seven-day access window anchored to main wedding date                                                |
| Exports     | Team exports/downloads allowed before expiry; archive access cannot extend past photo expiry                                                               |
| Publishing  | Preview before first publication; subsequent saved edits become live immediately                                                                           |
| Dates       | One main wedding date anchors retention/slug; events can span multiple dates                                                                               |
| Themes      | Three variants share behaviour/data; final visuals remain to be designed                                                                                   |
| Email       | Resend adapter implemented for team setup/recovery; development defaults to private outbox, production disabled until configured; live delivery unverified |

## Implementation tracker

| Workstream                       | State                     | What exists / what remains                                                                                                            |
| -------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace/build configuration    | Complete                  | Three packages, explicit shared exports and build-before-consumption scripts                                                          |
| Frontend foundation              | Complete                  | Neutral React shell, routing, query provider, typed health request, CSS Modules                                                       |
| Backend foundation               | Complete                  | App factory, configuration, safe logging/errors, health, Atlas adapter, production routing                                            |
| Shared contracts                 | Complete                  | Infrastructure, theme identifiers and strict auth request/safe response schemas                                                       |
| Tests and checks                 | M2 Atlas checks passed    | 76 credential-free tests; 10 real Atlas integration tests; 2 Atlas-backed browser journeys passed; full root check passed             |
| Atlas application connectivity   | Verified                  | After owner updated network access: real integration/browser checks passed; development readiness returned ready                      |
| Database schema/migrations/seeds | M2 applied to development | Explicit 001/002 migrations completed in verified development database; no user or wedding seeded                                     |
| Authentication and team          | M2 Atlas verified         | Manager access and password recovery passed real persistence/browser checks; controlled Resend and production HTTPS acceptance remain |
| Wedding website/events/themes    | Not implemented           | No business endpoints, publication flow, polling or final themes                                                                      |
| Invitations/estimates            | Not implemented           | No RSVP in version-one scope                                                                                                          |
| Expenses/tasks                   | Not implemented           | Exact money, revisions and wedding isolation required when built                                                                      |
| Photos/moderation/exports/jobs   | Not implemented           | Full lifecycle and expiry protection required before enabling                                                                         |
| Vendors/streaming                | Not implemented           | Google Places discovery and YouTube embedding later                                                                                   |
| Deployment                       | Not configured            | Hosting, production Atlas/S3/email and operational policies pending                                                                   |

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

The detailed plan is now [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md). The owner supplied a planning scenario of 31 December 2026, invitations beginning 16 November (45 days earlier), 25 per day, and Resend email invitations. This is not a confirmed actual wedding date. Direct family email dispatch is a newly requested extension to the previous manual WhatsApp baseline; schemas/routes/status semantics must be reconciled before implementation.

1. Owner reviews the completed auth slice locally and handles staging setup: stable CSRF secret, HTTPS origin/proxy trust, explicit migration, then the signup/login/logout smoke journey. Prepare CI separately.
2. Complete M2 provider acceptance: configure the Resend sender with controlled staging recipients. Atlas integration/default browser checks and the development migration have passed.
3. Review Manager setup/recovery and durable email behaviour over the real staging HTTPS origin; code/local substitute checks alone do not verify external services.
4. Build guest website/events, publication and all three themes; add family links, estimates and team-reviewed daily invitation batches for the proposed 16 November release.
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

## Update checklist for every development handoff

- Update the date, milestone and affected tracker rows.
- Describe implemented behaviour and link relevant code/docs when useful.
- Record tests/checks actually run, their outcomes and any unverified external dependencies.
- Record new decisions, baseline conflicts and operational limitations without secrets.
- Append a dated history entry; preserve earlier entries.
- Leave the next contributor a concrete next action.
