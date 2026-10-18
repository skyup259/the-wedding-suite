# Manual families and invitations QA

Date: 18 October 2026 (Asia/Kolkata). Branch: `feature/wedding-website-events`, current local M4A working tree.

**Result: exercised core journeys passed; no new functional defect confirmed.** This is scoped QA evidence, not production acceptance.

## Environment and method

Built the current application with root `npm run build`, then manually operated its existing isolated test server on port 3101 against real Atlas. Prepared two synthetic weddings and complete ceremonies through HTTP for setup/isolation checks. Family operations were exercised in the browser; supplementary HTTP checks covered hidden permission, token, timestamp and pagination boundaries. No mock persistence was used.

All names, accounts, contacts and ceremonies were synthetic. The development wedding was not populated or published. No real email or WhatsApp message was sent; WhatsApp verification covered its destination and encoded prefilled message. Application code and private configuration were unchanged by QA.

## Manual browser cases

| Case                               | Result        | Evidence                                                                                                                                                                                                                     |
| ---------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty state                        | Pass          | No families and zero Sent/estimated attendees.                                                                                                                                                                               |
| Required family fields             | Pass          | Empty required name blocked submission and focused its input.                                                                                                                                                                |
| Phone and ceremony validation      | Pass          | Invalid phone and missing selection rejected; entries retained.                                                                                                                                                              |
| Add family                         | Pass          | Display name, private contact/phone and selected ceremonies saved; starts Not sent. Optional phone could be omitted.                                                                                                         |
| Draft sharing guard                | Pass          | Share rejected with an instruction to publish first. Preview/publication then enabled sharing.                                                                                                                               |
| Selected-ceremony message          | Pass          | Greeting, selected ceremony names, wedding-local dates/times, venues and timezone were correct; private family contact omitted.                                                                                              |
| Copy link / Copy message           | Pass          | Clipboard contents exactly matched the displayed values. The initially empty clipboard was cleared after the test.                                                                                                           |
| WhatsApp prefill                   | Pass, bounded | `wa.me` destination and decoded text exactly matched the invitation message. No external composer/send or actual delivery was exercised.                                                                                     |
| Sharing is separate from Sent      | Pass          | Copying/sharing did not change Sent state or estimates.                                                                                                                                                                      |
| Anonymous personal page            | Pass          | Family greeting and selected venues/organiser contacts shown first; full schedule remained visible below, with only selected ceremonies labelled invited. Private family contact omitted.                                    |
| Capability scrubbing               | Pass          | Address changed to the token-free invite path. Reload instructed the guest to reopen the original link; reopening worked.                                                                                                    |
| Mark Sent                          | Pass          | One Sent family produced 2–3 attendees; timestamp displayed.                                                                                                                                                                 |
| Unique estimates across ceremonies | Pass          | Two Sent families with overlapping selections produced 4–6 overall, not the sum of per-ceremony estimates. Ceremony ranges were 2–3, 4–6 and 2–3.                                                                            |
| Unsent exclusion                   | Pass          | Adding a third unsent family increased family count but left 4–6 estimated attendees unchanged.                                                                                                                              |
| Search                             | Pass          | Literal `[Family]` matched its actual display name; lowercase contact-name search found the expected family. A no-match search displayed the appropriate filtered empty state.                                               |
| Filters                            | Pass          | Sent filter showed both Sent families; ceremony filter included the matching Sent and unsent families. Summary remained wedding-wide.                                                                                        |
| Edit family                        | Pass          | Updated display name, contact, phone and ceremony selections saved. Per-ceremony estimates changed; original personal link showed updated content.                                                                           |
| Competing edits                    | Pass          | Second-tab stale save was rejected with entered text retained. Explicit Reload saved family loaded current values/selections.                                                                                                |
| Re-sharing stability               | Pass          | After editing and marking Sent, sharing returned the same URL without increasing counts or resetting the displayed timestamp.                                                                                                |
| Replace link                       | Pass          | Cancel closed confirmation without mutation. Confirm produced a different link and preserved Sent/counts. Open old personal content became unavailable on refresh; reopening the old link failed and the replacement worked. |
| Mark Not sent / Sent again         | Pass          | Not sent removed timestamp/contribution and reduced estimate to 2–3. Sent again restored the contribution with a new timestamp.                                                                                              |
| Referenced ceremony archive        | Pass          | Initial archive required a second referenced-record confirmation. Cancel retained the ceremony; confirm archived it while retaining family records/history.                                                                  |
| Archived ceremony consequences     | Pass          | Team cards warned that invitation content changed. Archived ceremony left highlights/full schedule/active estimates; overall Sent-family total stayed unchanged.                                                             |
| Editing historical selections      | Pass          | Saving the archived selection was rejected with entries retained. Removing its explicit archived checkbox allowed saving.                                                                                                    |
| Archive family                     | Pass          | Cancel retained the family. Confirm removed it from active list/estimates and invalidated its current invitation link. Two remaining active families, one Sent, gave 2–3 attendees.                                          |
| Larger list                        | Pass          | After HTTP setup added 22 unsent families, browser showed 20 cards and Load more expanded to all 24.                                                                                                                         |

## Supplementary direct HTTP checks

All **17 scenarios passed** against the same isolated real Atlas database:

1. Anonymous management/estimate access denied.
2. Browser-archived family retained historically, with active detail unavailable and correct remaining counts.
3. Empty, duplicate, foreign-wedding and archived ceremony selections rejected.
4. General list/detail responses excluded capability material and internal ownership fields.
5. Share/re-share returned stable links without changing revision, Sent state or estimates.
6. Personal projection excluded private contact data, with no-store/no-referrer/noindex headers.
7. Malformed, unknown and wrong-wedding capabilities returned generic 404 responses.
8. Other wedding could not read/edit/share/rotate/mark/archive the first wedding's family.
9. Missing/stale If-Match rejected; partial contact patch preserved phone.
10. Repeated Mark Sent and re-sharing preserved sentAt and unique-family counts.
11. Rotation invalidated the old link without changing family identity or Sent timestamp.
12. Not sent cleared timestamp and removed estimate contribution.
13. Archive invalidated the current link and preserved history.
14. Manager could create/edit/share/mark/archive their own wedding's family.
15. Equal display names remained separate family records, rather than being merged by name.
16. Literal/no-match search and the 100-character search limit behaved correctly.
17. Pagination over 24 records had no duplicates/omissions; changed-filter and wrong-wedding cursors were rejected.

## Checks, limits and cleanup

- `npm run build`: passed.
- `npm run test:client -- client/src/features/invitations/invitations.test.tsx`: five tests passed.
- The implementation's historical full check, Atlas integration suite and automated browser totals in PROJECT_STATUS.md were not rerun in full here.
- Browser coverage was desktop. Mobile/real-device layout, exact refresh cadence/focus-return timing, network-outage recovery, rate-limit exhaustion, production key-loss/rotation operations, production HTTPS and real WhatsApp/provider delivery remain unverified by this run.
- Existing deferred bugs in BUG_BACKLOG.md were not fixed or reclassified. Transient browser-locator failures were inspected and recovered; they did not establish application defects.
- Stopped only the isolated QA server; explicitly awaited guarded removal of its exact temporary database and private outbox. Existing development services/data/configuration were preserved, and final development readiness returned `ready`.
- Screenshots are temporary local artifacts under `/private/tmp/wedding-suite-m4-qa/`: personal invitation, unique estimates, stale family error and archived-family estimates. Screenshots contain synthetic data, without active invitation capabilities. No private link or credential is included in this report.

Next: owner review of these results, mobile/operational acceptance as needed, then agree M4B email policy and controlled provider acceptance separately.

Documentation validation: root `npm run format:check` and `git diff --check` passed for the QA handoff. QA-006 in BUG_BACKLOG.md now records the verified family/reference cases while leaving other endpoint/reference acceptance separate.
