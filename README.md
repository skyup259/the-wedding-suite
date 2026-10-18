# The Wedding Suite

An Indian wedding management application, built as a modular monolith. This repository currently contains the technical scaffold, not implemented wedding features.

Start with [PROJECT_STATUS.md](./PROJECT_STATUS.md) for progress, decisions, verification, and the next development milestone. Update that document with every meaningful development change. [AGENTS.md](./AGENTS.md) makes this handoff requirement explicit for future coding agents and contributors.

## Requirements

- Node.js 24.21.0 (`.nvmrc`) and npm 11.19.0.
- A private MongoDB Atlas development connection for running the backend. Tests and frontend-only development do not need credentials.

## First run

1. Run `npm ci` at the repository root.
2. Copy `server/.env.example` to `server/.env` locally.
3. Set the real Atlas URI privately, using [MONGODB_DEVELOPMENT.md](./MONGODB_DEVELOPMENT.md). Percent-encode reserved characters in URI credentials. Select `marriage_suite_dev`; never select a system or sample database. Check your current Atlas network access and database-user permissions.
4. Run `npm run dev`.
5. Open `http://localhost:5173`. Vite proxies `/api` to Express on port 3000.

Backend startup validates configuration and pings Atlas before listening. Startup never creates collections, indexes, migrations, or seed data. A successful ping establishes connectivity, not verified write permissions or a deployed schema. The development database may not appear in Compass until future migrations create its first collection.

No real `.env` or credential is created by the scaffold. Without Atlas credentials, use `npm run dev:client`; the shell will honestly report that the service is unavailable. Combined development stops its child processes together if one exits. Restart after editing environment values. `TRUST_PROXY=false` is the safe default; change proxy trust only for the chosen hosting topology. Custom backend ports require updating the Vite proxy as well.

### Proxy error: ECONNREFUSED on port 3000

This means Vite cannot reach Express. `npm run dev:client` starts only the frontend/shared watchers; it does not start the backend. The readiness request will fail until the backend is running.

If `server/.env` does not exist, copy the example without overwriting an existing configuration:

```sh
cp -n server/.env.example server/.env
```

Edit `server/.env` privately and replace the placeholder MongoDB URI with your real development connection. Keep `PORT=3000` and `APP_ORIGIN=http://localhost:5173` for the default setup. Stop any existing frontend-only development command, then run `npm run dev` from the root. Confirm the `[server]` output says `Server started` before expecting readiness to succeed.

If startup instead reports `Invalid server configuration`, correct the named fields. If it reports `Atlas connection failed`, check the URI, Atlas network access and database-user credentials. Do not paste credentials into logs or chat. The backend checks Atlas before opening its HTTP listener, so a connection failure can also cause the proxy refusal.

## Commands

| Command                | Purpose                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`          | Build shared, then watch shared/server/client                                   |
| `npm run dev:client`   | Build/watch shared and run Vite without backend credentials                     |
| `npm run dev:server`   | Build/watch shared and backend                                                  |
| `npm run build`        | Build shared, server, then client; stop on failure                              |
| `npm start`            | Start compiled Express; use production environment to serve the built frontend  |
| `npm run typecheck`    | Build shared declarations and check all packages, including tests/configuration |
| `npm test`             | Build shared and run all test projects once                                     |
| `npm run test:client`  | Run only client tests                                                           |
| `npm run test:server`  | Run only server tests                                                           |
| `npm run test:shared`  | Run only shared tests                                                           |
| `npm run lint`         | ESLint with zero warnings allowed                                               |
| `npm run format`       | Format application code and maintained project docs                             |
| `npm run format:check` | Check formatting without writing                                                |
| `npm run check`        | Formatting, lint, types, tests, and production build                            |

Run one development entry point at a time. Root scripts prepare shared output automatically; direct workspace consumer commands assume shared has already been built.

## Packages and contracts

| Package   | Responsibility                                                                   |
| --------- | -------------------------------------------------------------------------------- |
| `client/` | React, TypeScript, Vite, React Router, TanStack Query, CSS Modules               |
| `server/` | Express, TypeScript, MongoDB driver, validated configuration and HTTP foundation |
| `shared/` | Browser-safe Zod schemas and API types                                           |

Shared exports `@wedding-suite/shared`, `@wedding-suite/shared/http`, and `@wedding-suite/shared/themes` through compiled ESM and declaration files in `shared/dist`. Source/internal paths are not public exports. No MongoDB documents, credentials, or backend services belong in shared.

All development entry points build shared first. TypeScript then watches shared with `noEmitOnError`; backend watch explicitly includes shared emitted JavaScript. Vite observes the linked package without pre-bundling it. A shared compilation failure leaves the last valid runtime output in use while the compiler reports the error; correct it to resume updates. `check` must pass before handing changes off.

Production artifacts are `shared/dist`, `server/dist`, and `client/dist`. Deploy these with the workspace manifests, root lockfile, and production dependencies so the shared workspace link remains valid. Build with development dependencies available; do not deploy server output alone.

## Tests

The root `vitest.config.ts` explicitly references three package projects. Client uses jsdom and Testing Library; server uses Node and Supertest with injected dependencies; shared uses Node. Test discovery is scoped to each package, excluding generated output and future integration-test files. Tests do not load local environment files or contact Atlas. Server app construction is separate from listener/database startup.

Database integration tests, two-wedding seed data, migrations and Playwright will be added with actual feature implementation. They will use a dedicated test database and explicit commands; ordinary tests must remain credential-free.

## Production HTTP routing

Set `NODE_ENV=production`, an HTTPS `APP_ORIGIN`, and private Atlas configuration, then run `npm run build` and `npm start`. Production does not load a local `.env`; use deployment environment/secret configuration.

`/api/v1/health/live` checks the process. `/api/v1/health/ready` checks current database connectivity. Unknown `/api` routes return JSON 404 errors, including when HTML is requested. Malformed/oversized API JSON receives a JSON error. Static serving exposes only `client/dist`. Frontend GET navigation accepting HTML receives the React shell; missing assets and non-navigation requests do not. Wedding-specific titles/social metadata will be added with the website feature.

HTTP logs omit paths, query strings, headers and bodies to prevent access-link leakage. Error responses contain a request ID and no stack traces or provider diagnostics.

## Feature organisation as development proceeds

- Backend `src/modules/{auth,team,weddings,events,invitations,tasks,expenses,photos,vendors}`: routes, services, validation and wedding-scoped repositories. Do not add generic base repositories or bypass server-side permissions.
- Backend `src/jobs/`: durable MongoDB leases, idempotent handlers, retry/backoff and recovery. Add no working handler until its lifecycle tests exist.
- Backend `migrations/`: versioned validators/indexes/backfills, recorded in `schemaMigrations`; never apply implicitly during normal startup.
- Backend `src/infrastructure/`: database, private S3, provider-neutral email and Places integration boundaries.
- Client `src/features/`, `components/`, and `themes/{shared,traditional,floral,minimal}`: feature organisation, common guest behaviour and presentation variants. Dashboard styling remains independent.

Authentication, all wedding feature endpoints, forms, three finished themes, photo uploads/moderation/exports, background processing, email and vendor search are not implemented. Add their dependencies when used. The scaffold does not present sample data as real application results.

## Planning references and decisions

- [PRD.md](./PRD.md): product scope and acceptance criteria.
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md): modular monolith and external-service architecture.
- [DATABASE_DESIGN.md](./DATABASE_DESIGN.md): data, indexes, money, revisions, transactions and retention.
- [API_DESIGN.md](./API_DESIGN.md): exact REST routes, permissions and envelopes.
- [MONGODB_DEVELOPMENT.md](./MONGODB_DEVELOPMENT.md): historical Atlas setup and private connection guidance.
- [PROJECT_STATUS.md](./PROJECT_STATUS.md): current implementation state and decisions made after those documents.

The original planning documents were relocated unchanged. Design references under `stitch_marriage_suite_ui_design/` remain untouched, outside build/format/lint scope and outside public assets. Their mock controls do not expand product scope; RSVP remains excluded. New files must not overwrite that reference material.

## Progress maintenance

Every feature/fix handoff must update `PROJECT_STATUS.md`: what changed, what works, verification actually performed, unresolved limitations and the next action. Preserve the dated history. Do not mark a task complete based solely on code existing, and never include credentials, personal invitation links or signed media URLs. If a baseline requirement changes, record the decision and identify the document reconciliation needed.
