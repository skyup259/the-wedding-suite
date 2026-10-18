# Bug backlog and deferred improvements

Last updated: 18 October 2026 (Asia/Kolkata). Baseline: M3 commit `3c68675` on `feature/wedding-website-events`.

The owner requested that the current noncritical findings be documented for later review instead of fixed now. This register consolidates existing QA evidence; creating it does not constitute a new application test or a claim that every flow is defect-free. No fixes are included in this documentation change.

## Severity and priority

Severity describes observed impact. Priority describes when to act. For validation tasks, priority is the recommended review timing; severity remains unassigned until a defect is demonstrated.

| Severity | Meaning                                                                             |
| -------- | ----------------------------------------------------------------------------------- |
| Critical | Observed security/privacy breach, unrecoverable data loss or broad service failure. |
| High     | Core journey blocked with no practical workaround.                                  |
| Medium   | Meaningful functional impairment with a workaround.                                 |
| Low      | Wording, duplicated feedback or minor usability issue; core behaviour works.        |

| Priority | Timing                                                                           |
| -------- | -------------------------------------------------------------------------------- |
| P0       | Interrupt planned work immediately.                                              |
| P1       | Resolve a confirmed serious defect before the affected release.                  |
| P2       | Plan a follow-up fix or acceptance task; may proceed with unrelated development. |
| P3       | Deferred polish; review in a later maintenance pass.                             |

There are **three open Low / P3 bugs** in the recorded QA. No open Critical or High defect was reported in those exercised cases. Incomplete validation and environment prerequisites are listed separately below; they do not establish a product bug.

## Open bug summary

| ID      | Feature    | Finding                                                  | Severity | Priority | Status                   |
| ------- | ---------- | -------------------------------------------------------- | -------- | -------- | ------------------------ |
| BUG-001 | Signup     | Missing wedding date shows technical validation text     | Low      | P3       | Open — deferred by owner |
| BUG-002 | Signup     | Duplicate-email error appears twice                      | Low      | P3       | Open — deferred by owner |
| BUG-003 | Ceremonies | Last-ceremony archive rejection uses publication wording | Low      | P3       | Open — deferred by owner |

### BUG-001 — Technical missing-date message

- **Evidence:** QA-01 in [manual auth QA](./MANUAL_AUTH_QA.md); reproduced again in [M2/M3 QA](./MANUAL_M2_M3_QA.md).
- **Reproduction:** Open signup, complete valid account details, advance to wedding details, leave the wedding date blank and submit.
- **Actual:** Date feedback says “Invalid ISO date.”
- **Expected:** A clear instruction such as “Choose your wedding date.” Invalid entered dates should receive appropriate date-format feedback.
- **Impact:** A user may not understand ISO terminology. Submission is correctly blocked; no invalid wedding is created by this case.
- **Known cause:** `calendarDateSchema` in `shared/src/auth.ts` uses `z.iso.date()` without a user-facing required-date message; `SignupPage.tsx` renders the schema error.
- **Priority reason:** Validation works and the user can continue by choosing a valid date. This is deferred copy polish.
- **Workaround:** Select a valid wedding date.
- **Suggested fix:** Add friendly required/invalid-date messages while preserving strict date validation; check other consumers of the shared schema.
- **Acceptance:** Empty date produces a clear required-date instruction; malformed dates still fail; valid signup still succeeds.

### BUG-002 — Duplicate duplicate-email feedback

- **Evidence:** QA-02 in [manual auth QA](./MANUAL_AUTH_QA.md). Later M2/M3 QA verified duplicate prevention by HTTP but did not freshly reproduce the exact duplicate UI presentation.
- **Reproduction:** Create a synthetic account, sign out, then submit signup again using that email and otherwise valid details.
- **Actual:** “An account already uses this email. Sign in instead.” appears beneath the email field and above Continue.
- **Expected:** One clear actionable message, with focus directed appropriately and the entered values retained.
- **Impact:** Repeated messaging makes the form noisy. Duplicate-account creation is correctly prevented.
- **Known cause:** In `SignupPage.tsx`, the duplicate-email catch path sets the email field error and then also sets the submission error. Both are rendered. This was confirmed by code inspection for this register; the UI was not rerun.
- **Priority reason:** The user receives correct feedback and can sign in or use recovery. No core journey or uniqueness protection is broken.
- **Workaround:** Use Sign in or Forgot password for the existing account.
- **Suggested fix:** Keep one accessible error presentation and verify focus, retained values and the existing sign-in guidance.
- **Acceptance:** Repeating signup with an existing email creates no extra account/wedding, displays the conflict once and retains the form values.

### BUG-003 — Misleading archive-guard wording

- **Evidence:** Low finding in [M2/M3 QA](./MANUAL_M2_M3_QA.md).
- **Reproduction:** Publish a wedding with one active ceremony. From ceremony management, request archive of that ceremony and confirm.
- **Actual:** Archive is rejected with “Add at least one ceremony before publishing.” The wedding is already published.
- **Expected:** Explain the current action, for example: “Add another ceremony or unpublish the wedding before archiving the last ceremony.”
- **Impact:** Confusing recovery instructions. The publication-completeness guard correctly prevents an empty live schedule.
- **Known cause:** The publication-completeness check in `server/src/modules/website/website.service.ts` uses the same missing-ceremony wording when validating edits to an already-published wedding.
- **Priority reason:** The protective behaviour is correct and there are practical workarounds. Defer wording without weakening the guard.
- **Workaround:** Add another complete ceremony, or unpublish before archiving the last one.
- **Suggested fix:** Provide action-appropriate messaging while keeping transactional publication validation and revision checks.
- **Acceptance:** Last-ceremony archive remains blocked while published, the explanation gives a usable next step, and ordinary archive/unpublish flows still work.

## Fixed issue retained for regression tracking

### BUG-004 — Stale settings after publication

- **Status:** Fixed and verified; included in M3 commit `3c68675`. Do not count as open.
- **Historical severity / priority:** Medium / P2: saving after publication falsely conflicted, but explicit reload recovered the editor.
- **Reproduction before fix:** Open saved Preview, publish, return to website settings and save an edit without reloading.
- **Former result:** Settings could still show Draft and use the old revision, causing a false conflict.
- **Cause and fix:** The settings cache could initialise the editor before its background GET completed. Publication now cancels the in-flight settings read and seeds the acknowledged wedding status/revision before invalidation/navigation.
- **Verification recorded:** A regression test failed before the fix and passed afterward. Independent manual QA against rebuilt assets and isolated Atlas verified immediate Published status, successful save and guest content updates. Genuine two-tab conflicts still reject stale saves and retain entered text. See [M2/M3 QA](./MANUAL_M2_M3_QA.md) and [project status](./PROJECT_STATUS.md).
- **Regression expectation:** Keep coverage for Publish → return → save, delayed background reads, genuine stale edits and explicit reload/discard.

## Pending validation — no confirmed defect

These tasks can be scheduled later. A P2 acceptance task does not block unrelated feature development; complete relevant acceptance before claiming the affected production flow verified.

| ID     | Task                                                      | Priority / reason                             | Current evidence and limitation                                                                                                                                                                             | Completion evidence needed                                                                                                                                    |
| ------ | --------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-001 | Real-device mobile and keyboard/accessibility review      | P2 — guest/team usability                     | Historical automated mobile screenshots/checks passed; the latest manual viewport override stayed at 1280px. No mobile defect established.                                                                  | Check signup, team, settings, ceremony editor and all guest themes on working mobile devices; review overflow, focus, errors and keyboard use.                |
| QA-002 | Guest timer and focus/visibility refresh                  | P2 — live ceremony information                | Automatic updates were observed and automated assertions passed; exact cadence and independent return-to-tab behaviour were not manually measured.                                                          | Verify scheduled refresh and returning to a hidden/unfocused guest page; confirm unpublished content disappears.                                              |
| QA-003 | Network-outage save and refresh recovery                  | P2 — preserve work and communicate stale data | Failed-save entry retention has automated coverage; a broader manual outage/reconnect walkthrough remains incomplete.                                                                                       | Interrupt a save/guest refresh, confirm clear feedback and retained input/stale indication, reconnect and retry safely.                                       |
| QA-004 | Live Manager/recovery email and staging HTTPS             | P2 — acceptance before live use               | Private outbox and adapter tests passed; actual Resend delivery and staging cookie/proxy behaviour remain unverified.                                                                                       | Controlled recipients receive usable links through the configured sender; expiry/reuse/session and HTTPS/proxy behaviour pass. Never record live tokens here. |
| QA-005 | Long session expiry, rate limits and date/time edge cases | P2 — boundary acceptance                      | Automated boundary coverage exists; long-duration session expiry, rate exhaustion and DST cases were not manually covered in the latest run.                                                                | Controlled isolated checks confirm expected expiry/limits and timezone/DST feedback without altering real records.                                            |
| QA-006 | Referenced ceremony archives and larger lists             | P2 — integrity and scale acceptance           | M4A manual QA passed invitation-reference warning/cancel/confirm, retained family history and browser pagination from 20 to 24 families; scoped HTTP pagination also passed. See MANUAL_M4A_QA.md.          | Family cases verified; review remaining affected endpoint lists and reference types separately as their features become available.                            |
| QA-007 | Fresh-process public HTML after a build                   | P2 — release smoke check                      | Rebuilding during QA left the running process with cached HTML referencing old asset names. Private fresh loads/client navigation were used for the retest; fresh-process public HTML was not checked then. | Start the newly built server and directly load a published guest URL; verify assets and metadata. Investigate only if a normal fresh deployment also fails.   |

## Operational history and improvement suggestions

| ID      | Item                                            | Classification / priority                      | Reason and later action                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ----------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OPS-001 | Atlas access failed after the public IP changed | Resolved environment incident; P2 if recurring | The approved network entry no longer matched the machine's public IP. The owner updated Atlas access and later Atlas checks passed. Recheck the current approved address if it recurs; a TLS error alone does not establish a credential problem. Stable application egress is a deployment consideration; broadening network access is not part of this backlog action. |
| IMP-001 | CI checks on pull requests                      | Improvement / P2                               | Root checks currently provide local evidence. Add automated PR checks later to catch regressions consistently. CI absence is not a demonstrated application defect.                                                                                                                                                                                                      |
| OPS-002 | Hosting, backups and production operations      | Release prerequisites / P2                     | Hosting, production configuration and backup/restore rehearsal remain pending in project status. Review before a production release; this is separate from deferred cosmetic bugs.                                                                                                                                                                                       |

## Review and maintenance

- Owner decision: defer BUG-001–003 and review later. No fix date or assignee is committed; suggested owner is the next developer/QA reviewer assigned to the maintenance pass.
- When reviewing an item, reproduce it against the current commit first. Record the environment, expected/actual result and sanitised evidence; never include credentials, personal contact data, capability links or tokens.
- Keep stable IDs. Use Open → In progress → Fixed, awaiting verification → Verified/closed, or record why an item was not reproduced. Record the fix commit and checks before closing.
- Reassess severity if new evidence shows blocked workflows, data loss or privacy impact. A new confirmed serious defect must receive its own assessment rather than inheriting the current Low rating.
- Keep QA gaps separate from bugs. Planned M4 families/invitations, later photos, tasks/expenses, streaming and vendors are roadmap work, not defects in implemented M1–M3.

## Sources and documentation checks

- [Manual authentication QA](./MANUAL_AUTH_QA.md): original QA-01/QA-02 and their reproduction details.
- [Manual M2/M3 QA](./MANUAL_M2_M3_QA.md): archive wording, fixed publication regression and manual coverage limits.
- [Manual M4A QA](./MANUAL_M4A_QA.md): family/reference archive and larger-list acceptance, with browser/HTTP methods distinguished.
- [Project status](./PROJECT_STATUS.md): historical automated/Atlas/browser results and external-service limits.
- [Development roadmap](./DEVELOPMENT_ROADMAP.md): future feature scope and release prerequisites.

For this documentation-only handoff, run root `npm run format:check` and `git diff --check`. Application, Atlas, browser and provider tests are not rerun or newly verified by this register.
