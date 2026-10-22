# Manual M4B email-batch QA

19 October 2026, Asia/Kolkata. Tested the current local working tree on `feature/wedding-website-events`, after M4A commit `8811aef`; M4B remains uncommitted. No application code was changed by this QA pass.

## Result and environment

The exercised reviewed-batch and private-outbox journeys passed. One new Low/P3 feedback defect was reproduced: **BUG-006**, malformed provider-ID feedback references highlighted fields without highlighting or format guidance. Existing Medium/P2 **BUG-005** remains open; this pass does not close the previously reproduced uncertain-send/content-edit defect. See [bug backlog](./BUG_BACKLOG.md).

Used rebuilt production assets in a desktop browser and an isolated server with a temporary real Atlas database, migrations 001–005, synthetic accounts/families, and explicitly selected private local outbox transport. Existing development settings were preserved. The ordinary development service had the previously documented invalid sender/startup problem; isolated QA did not depend on that service. No real email or WhatsApp message was sent.

## Manual browser results

| Case                                      | Observed result                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty selection and missing contact email | Preview disabled with no selection; a family without email cannot be selected.                                                                                                                                                                                                                                                   |
| Draft wedding                             | Preview rejected; checked families retained.                                                                                                                                                                                                                                                                                     |
| Contact email editing                     | Browser blocks malformed email and retains input; uppercase valid email saves normalized to lowercase.                                                                                                                                                                                                                           |
| Reviewed message                          | Each family has its own recipient and message; selected ceremony names, local times, venues and timezone match. Private family contact is absent from the invitation body. Outbox mode, allowance and review expiry are explicit.                                                                                                |
| Preview before confirmation               | Inspection found one preview, zero jobs, zero reservations, zero Sent families and zero outbox messages.                                                                                                                                                                                                                         |
| Confirm once                              | Two jobs created, allowance becomes 23, selection clears, and previously queued families become ineligible for another dispatch.                                                                                                                                                                                                 |
| Results and history                       | Automatic refresh changes queued results to outbox without a manual reload; results remain separate and history persists after reload. Sent remains unchanged.                                                                                                                                                                   |
| Stale family review                       | Editing a selected family in a second tab makes confirmation fail with changed-family guidance; selection remains available for fresh review.                                                                                                                                                                                    |
| Expired review                            | Controlled database expiry makes confirmation fail; reopening hides reviewed plaintext and disables confirmation. Expiry was injected rather than waiting 15 minutes.                                                                                                                                                            |
| Safe original retry                       | Controlled failed/retryable fixture offers retry only for the affected family. It finishes as outbox at attempt two, retaining dispatch identity, recipient/message hashes and idempotency key, without another quota reservation. The other family's result is unchanged. This simulates failure; no provider failure occurred. |
| Selection and remaining allowance         | At 25 checked families the next checkbox is disabled. Requesting more than the remaining allowance fails with selection retained; Clear selection resets all checkboxes.                                                                                                                                                         |
| Unknown outcome                           | Controlled unknown fixture shows the explicit warning against another send and offers provider verification, with no retry action. This is an injected state, not evidence of an actual provider timeout.                                                                                                                        |
| Invalid provider ID                       | Server rejects the malformed value and retains it, but the UI says “Check the highlighted fields” with no highlight, invalid-field state or UUID guidance: BUG-006.                                                                                                                                                              |

## Supplementary HTTP and Atlas checks

All **15 assertion groups passed** against the same isolated server/database. These supplement the manual browser work; they are not claimed as browser walkthroughs.

1. Anonymous batch access denied.
2. Empty, duplicate, oversized and foreign-family preview IDs rejected.
3. General history omits reviewed plaintext and dispatch secrets; responses use no-store.
4. Replaying a confirmed request with its original revision creates no extra jobs or reservations; missing precondition rejected.
5. Another wedding cannot read, confirm, retry or reconcile the batch.
6. Email normalization, partial-edit preservation and public contact omission hold.
7. Changing a previously queued family's recipient does not enable another dispatch.
8. Unknown outcome rejects retry; provider reconciliation fails closed in outbox mode.
9. An active Manager can review and confirm their own wedding's batch.
10. Wedding edits invalidate an earlier review; the email quota timezone remains fixed to the first confirmed timezone after a wedding timezone edit.
11. Preview has no dispatch/quota side effects; stale revision and forged resend flags rejected.
12. Concurrent Admin/Manager confirmations cannot exceed the daily cap; final allowance reaches zero and another preview fails.
13. Outbox jobs leave manual Sent and attendance estimates unchanged.
14. An unconfigured delivery webhook rejects a delivery claim.
15. Disabling a Manager prevents reading results and replaying confirmations.

Final inspection: **25 reservations, 25 dispatches, zero Sent families**. Twenty-four jobs were outbox and one was the controlled unknown fixture. There were 26 private outbox files: 25 family messages plus one synthetic Manager invitation. Each message had a separate recipient; terminal payloads were cleared. The injected unknown job had originally produced a local outbox file before its state was changed for QA.

## Checks, cleanup and limits

- Root `npm run build`: passed.
- `npm run test:client -- client/src/features/invitations/campaigns.test.tsx`: 3 passed.
- `npm run test:server -- server/test/campaigns.test.ts`: 12 passed after allowing local listeners. The initial sandbox run failed during listener setup with EPERM; the permitted rerun passed. These tests use mocked provider sends/lookups and signed webhook fixtures.
- Root `npm run format:check` and `git diff --check`: passed for the final documentation handoff.
- Stopped the isolated QA listener and awaited deletion of its exact temporary database and private outbox. Existing owner data and private configuration were preserved.

This run does not verify real Resend acceptance/delivery, live provider reconciliation, deployed webhook delivery, staging HTTPS, actual provider outages, long-duration timing, or full keyboard/accessibility behaviour. The attempted mobile viewport override remained at 1280px, so this manual run verifies desktop only. Earlier full-root, Atlas-suite and automated mobile results in PROJECT_STATUS.md are historical, not newly rerun here.

Next: review BUG-005 and BUG-006, correct private development/provider settings, and perform controlled live-provider and real-device acceptance before claiming those paths verified. No commit, push or deployment was performed.
