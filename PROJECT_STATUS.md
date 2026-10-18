# Project status and development handoff

Last updated: 18 October 2026 (Asia/Kolkata).

This is the living entry point for a new contributor. It records actual implementation progress, decisions, verification, limitations and the next development steps. Read [README.md](./README.md) for commands and setup, then the linked baseline documents for product details.

## Current milestone

**Technical scaffold — complete and verified.**

The owner approved the fresh scaffold on 18 October 2026. This authorises the technical foundation and dependency installation; business features remain subsequent development work. No deployment or production-service setup is part of this milestone.

## Confirmed architecture and product decisions

| Area        | Decision                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Application | Modular monolith; React/TypeScript/Vite frontend; Express/TypeScript backend                                                                |
| Repository  | npm workspaces: client, server, shared; ESM; CSS Modules and CSS variables                                                                  |
| Database    | MongoDB Atlas with official driver; separate development/production configuration; no Docker                                                |
| Access      | Email/password and MongoDB-backed opaque sessions, to be implemented; Admin/Manager accounts belong to one wedding; Guests have no accounts |
| Production  | Same-origin API and frontend; hosting provider undecided                                                                                    |
| Photos      | Private S3; approved public and private-family views; seven-day access window anchored to main wedding date                                 |
| Exports     | Team exports/downloads allowed before expiry; archive access cannot extend past photo expiry                                                |
| Publishing  | Preview before first publication; subsequent saved edits become live immediately                                                            |
| Dates       | One main wedding date anchors retention/slug; events can span multiple dates                                                                |
| Themes      | Three variants share behaviour/data; final visuals remain to be designed                                                                    |
| Email       | Transactional provider undecided; provider-independent implementation later                                                                 |

## Implementation tracker

| Workstream                       | State                 | What exists / what remains                                                                          |
| -------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| Workspace/build configuration    | Complete              | Three packages, explicit shared exports and build-before-consumption scripts                        |
| Frontend foundation              | Complete              | Neutral React shell, routing, query provider, typed health request, CSS Modules                     |
| Backend foundation               | Complete              | App factory, configuration, safe logging/errors, health, Atlas adapter, production routing          |
| Shared contracts                 | Complete              | Infrastructure response/error/health schemas and three theme identifiers                            |
| Tests and checks                 | Complete              | Three projects; 26 tests passed; formatting, lint, types and build passed                           |
| Atlas application connectivity   | User-reported working | Owner confirms backend and application running; independent application/write checks remain pending |
| Database schema/migrations/seeds | Not implemented       | No collections/indexes/validators/data writes at startup                                            |
| Authentication and team          | Not implemented       | No login, registration, sessions or team flows yet                                                  |
| Wedding website/events/themes    | Not implemented       | No business endpoints, publication flow, polling or final themes                                    |
| Invitations/estimates            | Not implemented       | No RSVP in version-one scope                                                                        |
| Expenses/tasks                   | Not implemented       | Exact money, revisions and wedding isolation required when built                                    |
| Photos/moderation/exports/jobs   | Not implemented       | Full lifecycle and expiry protection required before enabling                                       |
| Vendors/streaming                | Not implemented       | Google Places discovery and YouTube embedding later                                                 |
| Deployment                       | Not configured        | Hosting, production Atlas/S3/email and operational policies pending                                 |

## Verification record

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
3. Add durable email-delivery jobs to the job types when implementing setup/recovery messages.
4. Finalise session/setup/reset lifetimes, password policy and recoverable-link encryption-key rotation.
5. Choose final theme visuals, HEIC handling, upload limits, provider budgets and retention for audit/job metadata.
6. Verify Atlas application permissions, selected region/tier, backups and restoration; Compass authentication alone does not verify these.
7. Select hosting/email providers, proxy-trust settings, production regions, S3 policy/lifecycle and operational monitoring before pilot deployment.

Recoverable invitation/private-gallery links need a lookup hash plus authenticated encrypted token material for re-sharing. Passwords, sessions and one-use setup/reset tokens remain nonrecoverable. TTL cleanup never determines access validity.

## Next development sequence

1. Backend/application startup is now confirmed by the owner. Independently verify readiness and intended database-user permissions when beginning the database/authentication milestone; do not infer schema deployment or write access from startup alone.
2. Plan and implement migrations plus authentication/wedding creation, with transactional Admin/wedding creation and cross-wedding isolation tests.
3. Implement team setup/recovery with provider-neutral email and session revocation.
4. Implement wedding configuration, three themes, publication, events and guest updates.
5. Implement invitations/estimates and expense/payment tracking.
6. Implement private photo lifecycle, moderation, jobs, retention and pre-expiry exports.
7. Implement tasks, streaming and vendor discovery; run the complete pilot acceptance checks.

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

## Update checklist for every development handoff

- Update the date, milestone and affected tracker rows.
- Describe implemented behaviour and link relevant code/docs when useful.
- Record tests/checks actually run, their outcomes and any unverified external dependencies.
- Record new decisions, baseline conflicts and operational limitations without secrets.
- Append a dated history entry; preserve earlier entries.
- Leave the next contributor a concrete next action.
