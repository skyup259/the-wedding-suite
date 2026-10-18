# Manual authentication QA

Date: 18 October 2026 (Asia/Kolkata).

Result: core signup, login and logout journeys passed. Two minor UX findings remain; no blocking functional defect was observed in the exercised cases.

## Environment and method

- Development readiness at `http://localhost:5173/api/v1/health/ready` returned `ready`; the home page showed “Service connected and ready.”
- Built the current workspace with root `npm run build` (passed), then manually operated the browser through the existing isolated test server on port 3101 with real Atlas persistence and a randomly named temporary test database. No mocked authentication was used.
- Desktop browser viewport was 1280 × 720. Synthetic account and wedding details were used; no accounts were created in the development database.
- Existing development services and application source were preserved. This was a QA run, without implementation fixes.

## Cases exercised

| Case                                                   | Result                          | Observed behaviour                                                                                                              |
| ------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Anonymous dashboard navigation                         | Pass                            | Redirected to login.                                                                                                            |
| Empty login                                            | Pass                            | Email/password errors displayed; email received focus.                                                                          |
| Empty signup account step                              | Pass                            | Required name, email and password errors prevented progression.                                                                 |
| Invalid email, short password, mismatched confirmation | Pass                            | Relevant errors displayed; remained on account step.                                                                            |
| Valid account step using Enter                         | Pass                            | Advanced to wedding step and focused its heading.                                                                               |
| Missing wedding names/date                             | Pass, minor copy issue          | Blocked submission and focused first partner; date error uses technical wording (QA-01).                                        |
| Invalid timezone                                       | Pass                            | Clear timezone error blocked submission.                                                                                        |
| Back/Continue between steps                            | Pass                            | Account and wedding inputs retained.                                                                                            |
| Signup success                                         | Pass                            | Loading button disabled; opened dashboard with Admin role, supplied partner names/date/timezone and unpublished website status. |
| Session restoration after reload                       | Pass                            | Same authenticated wedding dashboard restored.                                                                                  |
| Signed-in navigation to signup/login                   | Pass                            | Both redirected to dashboard.                                                                                                   |
| Second tab                                             | Pass                            | Same authenticated dashboard available.                                                                                         |
| Logout                                                 | Pass                            | Returned to login; fields cleared.                                                                                              |
| Cross-tab logout                                       | Pass                            | Other open dashboard tab automatically returned to login.                                                                       |
| Browser Back after logout                              | Pass                            | Remained at login without restoring private dashboard.                                                                          |
| Unknown email login                                    | Pass                            | Generic “Email or password is incorrect.” feedback.                                                                             |
| Wrong password for existing email                      | Pass                            | Same generic feedback, no access granted.                                                                                       |
| Correct login with lowercase email                     | Pass                            | Account registered with uppercase characters successfully signed in using lowercase; plus tag preserved.                        |
| Duplicate signup                                       | Pass, minor duplicated feedback | Returned to account step with email conflict; input retained; error shown twice (QA-02).                                        |
| Original account after duplicate attempt               | Pass                            | Login still opened original wedding dashboard.                                                                                  |
| Persistence check after final logout                   | Pass                            | Exactly one user, one wedding and zero unrevoked sessions in isolated database.                                                 |
| Cleanup                                                | Pass                            | Stopped isolated server and explicitly awaited guarded removal of its exact temporary database.                                 |

## Findings

- **QA-01 — Low: technical date validation message.** On signup, advance with valid account details and submit the wedding step with no date. The date displays “Invalid ISO date.” Prefer an instruction such as “Choose your wedding date.” Validation itself works.
- **QA-02 — Low: duplicated duplicate-email feedback.** Complete signup, sign out, then submit signup again using the same email. The account step displays “An account already uses this email. Sign in instead.” beneath email and again above Continue. Prefer one clear error, with focus directed to the email field or error summary. Duplicate creation was prevented.

## Limits and next action

The requested 390 × 844 viewport override did not take effect in the browser tooling: DOM measurements remained 1280 pixels wide. Mobile layout is therefore **unverified in this run**; the override was reset. Real-device checks, a full accessibility audit, session expiry after 24 hours, disabled accounts, rate-limit exhaustion, network-failure recovery and production HTTPS cookie/proxy behaviour were not exercised manually. Historical automated checks are recorded separately in PROJECT_STATUS.md and were not rerun here.

Desktop screenshots were saved outside the repository under `/private/tmp/wedding-suite-manual-qa/` (dashboard and duplicate-signup state). They contain only synthetic data and may be removed by temporary-directory cleanup. No password or session token is included in this report.

Next: address the two minor feedback issues and repeat mobile QA with a working viewport or physical device before staging acceptance.

Documentation verification: root `npm run format:check` reported formatting failures in three unrelated access-feature files (`server/src/modules/access/access.repository.ts`, `server/src/modules/access/access.types.ts`, `shared/src/access.ts`). Those files were left untouched. Final development readiness still returned `ready` after QA cleanup.
