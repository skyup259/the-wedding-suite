# First feature: signup, login and logout

Prepared: 18 October 2026 (Asia/Kolkata).  
Status: First signup/login/logout slice implemented and verified locally; deployment remains pending. Deployment is being handled by the owner.

## The first complete journey

Create account and wedding → become its Admin → enter the private dashboard → refresh and remain signed in → log out → private access is denied → log in again.

This is the first feature because every operational module needs a trusted wedding boundary. Do not begin with an unconnected login form or create accounts without weddings: [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) requires a weddingId on each account, and [API_DESIGN.md](./API_DESIGN.md) combines account/wedding creation in registration.

## Scope and screens

| Screen/flow    | Behaviour                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `/signup`      | Account details and wedding setup, followed by one transactional registration request            |
| `/login`       | Email/password, generic invalid-credentials feedback and redirect to dashboard on success        |
| `/dashboard`   | Protected responsive shell showing actual user/wedding information; clear next-step/empty states |
| Logout action  | Revoke current server session, clear cookie and private query cache, return to login             |
| Browser reload | Resolve current identity from `/auth/me` before deciding whether dashboard access is allowed     |

Implemented signup UX: two short steps inside one form. Step one collects display name, email, password and password confirmation; step two collects both partner names, main wedding date and timezone. The browser submits once after both steps validate. Password confirmation is client-only; never send or store it. Start with the existing `traditional` theme identifier as a provisional default; detailed theme selection/customisation belongs to the website feature. This UX default does not rename any shared theme identifiers.

Use the design references' warm surfaces, Olive/Ivory palette and responsive dashboard structure through CSS Modules. Authentication screens are not supplied in the references and need their own accessible layouts, labels, focus handling and loading/error states. Do not copy RSVP/guest-count controls into this feature.

## Exact first API surface

All routes are under `/api/v1` and follow the existing envelopes/status codes.

| Route                 | Expected result                                                                      |
| --------------------- | ------------------------------------------------------------------------------------ |
| `GET /auth/csrf`      | Establish pre-login protection and return CSRF token                                 |
| `POST /auth/register` | Validate account/wedding input; create both atomically; 201 and a fresh login cookie |
| `POST /auth/login`    | Verify credentials/current account state; rotate session identifier; 200 and cookie  |
| `GET /auth/me`        | Return safe user/role/wedding summary; 401 for invalid, expired or revoked access    |
| `POST /auth/logout`   | Revoke session and clear cookie; 204 without a response body                         |

Implement cookie-authenticated request protection for signup/login as well as authenticated writes. Auth actions do not need arbitrary resource revisions; document their explicit `If-Match` exceptions consistently with the API baseline.

## Implementation order

1. **Contracts and persistence design.** Add shared strict request/response schemas and serialised safe user/wedding types. Define field limits, session policy and auth errors. Pre-login CSRF context must remain separate from authenticated session records, which require a valid userId and weddingId. Record any additional persistence fields/collections explicitly before writing validators.
2. **Versioned migrations.** Implement an explicit migration runner/history and the first validators/indexes for users, weddings and sessions, plus audit records as needed. Enforce unique normalised email, unique slug, at most one Admin per wedding and session-token lookup/TTL cleanup. Do not auto-migrate on application startup or create unrelated feature collections.
3. **Auth primitives and middleware.** Add maintained password/cookie/CSRF/rate-limit libraries as needed. Implement Argon2id hashing, cryptographically random opaque sessions, stored token hashes, expiry/revocation/current account checks and session-derived wedding scope. Never accept role or wedding ownership from client input. Authenticated sessions are server-side; the browser stores only the protected cookie.
4. **Backend flows.** Create wedding/Admin atomically; calculate date/timezone-derived expiry and collision-safe slug; keep wedding unpublished. Implement login, current-user projection and logout. Handle duplicate email/concurrent registrations and database failures without leaving orphan weddings/accounts. No session cookie is issued before successful persistence.
5. **React flows.** Add the two-step signup, login, protected dashboard layout and logout. Use React Hook Form/Zod, the existing fetch wrapper and TanStack Query. Extend the fetch wrapper to support 204 responses and CSRF headers. Preserve ordinary form values after failures without persisting passwords. Clear private query data on logout, expired session and account changes; do not store session tokens in localStorage.
6. **Verify the full journey.** Test service/middleware rules and HTTP cookie flows, then a browser journey. Use an isolated test database for transaction/index tests; ordinary tests stay credential-free. Keep test registrations out of the owner's real wedding data.
7. **Handoff for deployment.** Run `npm run check`, document migration/environment steps and update progress. The owner can apply the reviewed migration to staging, deploy the reviewed build and test the same journey over HTTPS before a production release.

## Implemented operating defaults

- A 24-hour absolute authenticated-session lifetime initially, configured through `SESSION_TTL_SECONDS`; no remember-me option in this slice. Every request checks expiry in application code, independently of TTL cleanup.
- Passwords of 15–128 characters, allowing spaces and password-manager paste, with no arbitrary symbol/composition rule. Preserve the actual password; trim/normalise email separately. This is the initial password-only policy. [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- Use Argon2id with parameters reviewed against the current guidance and available server resources. Do not implement a password hashing algorithm manually. [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- `HttpOnly` session cookie, appropriate `SameSite` policy, `Secure` on deployed HTTPS, no broad cookie domain, CSRF token plus origin checks. Local HTTP development gets an explicit development-only cookie configuration. [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- Generic login errors for unknown email, wrong password and disabled account; rate-limit signup/login and token endpoints. The initial 15-minute limits are signup 5/IP, login 30/IP and 10/email, and CSRF 120/IP; configure proxy trust for the real deployment.

Email verification, password reset, Manager invitations and Resend dispatch are separate follow-up flows under the roadmap. The first signup/login/logout slice requires neither an invitation-email queue nor a Resend API key. Do not show working-looking reset/Manager controls until their endpoints exist. Password recovery must follow before relying on authentication for a public pilot.

## Acceptance checklist

- [x] Registration persists one wedding and its sole Admin together, including correct initial timezone/theme/retention fields.
- [x] Duplicate/concurrent registration and a failed transaction leave no orphan data.
- [x] Signup/login return safe summaries; passwords, hashes, raw session identifiers and internal secrets never appear in JSON or logs.
- [x] Refresh uses the server session; invalid/expired/disabled/revoked sessions cannot access `/auth/me` or the dashboard's private requests.
- [x] Login rotates the session; logout revokes the current session and removes private browser cache data.
- [x] Cross-wedding ownership cannot be selected by the browser; an authenticated account cannot register a second wedding.
- [x] Pre-login and authenticated CSRF cases, request origins, cookie flags, rate limits and generic login errors are tested.
- [x] Calendar/timezone/slug logic, unique indexes and registration transaction behaviour have meaningful tests.
- [x] Desktop/mobile browser journey and layout reviewed; keyboard step navigation and validation/error states exercised. Automated component/HTTP tests cover validation and failure paths; broader device/accessibility review remains future work.
- [x] Protected endpoint behaviour is verified directly, not just by checking hidden frontend navigation.
- [x] Full checks pass; migration steps and required environment variables are documented for the owner's deployment.

## Runtime verification history

On 18 October 2026 the development command was started. Vite reached its ready state on `http://127.0.0.1:5173/`, but Express did not start listening because its Atlas connection failed. A separate read-only MongoDB ping produced a `MongoServerSelectionError` with a TLS-related failure. Credentials were not printed, and no data/schema write was attempted. This does not identify whether the underlying cause is network access, certificate/proxy configuration or the provider; preserve TLS validation and investigate connectivity separately. The owner's earlier successful run remains recorded in project history.

Unit/component work and mocked HTTP flows can proceed without live Atlas. Real transaction/index integration acceptance remains pending until the dedicated test connection succeeds.

Follow-up investigation on the same date found an IP access-list mismatch: the current public outbound IP did not match Atlas's sole active `/32` entry. Cluster/user/authSource settings matched the guide, and all three nodes were reachable over TCP but rejected TLS before authentication. The outdated access rule is the leading cause; no rule or TLS setting was changed, and successful reconnection remains to be verified after a narrow authorised IP update.

Resolved on 18 October 2026: after the owner added the new current-IP access entry, the application MongoDB adapter connected and pinged successfully. The restarted backend returned HTTP 200 readiness both directly on port 3000 and through Vite on port 5173; the frontend returned HTTP 200. The IP access-list cause is confirmed without disabling TLS or changing credentials. Connectivity is verified; transaction/index/write-permission tests are still required before authentication persistence is accepted.

Implementation handoff — 18 October 2026: the full signup/reload/logout/private-denial/login browser journey passed against built frontend assets and an isolated real Atlas database. Transaction rollback, concurrent duplicate registration, unique indexes, validators and distributed rate counters passed in Atlas integration tests; integration test cleanup completed; interrupted browser child cleanup was hardened with an awaited Playwright global teardown. The explicit auth migration was applied to the development database without seeding accounts. See PROJECT_STATUS.md for final check totals and current runtime state. Recovery, Manager setup, verification email and production rollout remain outside this completed first slice.

Final recheck note: after the earlier passing browser/Atlas runs, the public IP changed away from the owner-approved Atlas entry and a later browser rerun failed during TLS negotiation. Reconfirm the current Atlas IP entry is Active before retrying real database tests or starting the backend. Credentials/TLS settings were not changed to work around this. The implementation is complete; the last live recheck is pending network access.
