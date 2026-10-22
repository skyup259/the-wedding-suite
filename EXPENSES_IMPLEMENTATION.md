# Expenses and payments — M5A

Implemented locally on `feature/expenses-payments`, after the GitHub Desktop checkpoint `20bdb43` was pushed. Tasks remain the next separate feature. Final root check passed all 150 tests; all 32 real Atlas integration tests and the targeted desktop/mobile expense browser journey (including lost-response retry) passed. Migration 006 is applied to development. Consult PROJECT_STATUS.md for evidence and remaining limits.

## User behaviour

Open `/expenses` from the private dashboard or workspace navigation. Both Admin and Manager can create, edit and archive expenses; add, edit and remove payments; and inspect summaries. Guests and other weddings have no access.

An expense has a description, category, ceremony or Shared across wedding, INR cost, optional vendor/recipient and notes. Payments record a positive amount, payer name, calendar date, optional method and notes. Payers may be family members without application accounts. The API also accepts an optional same-wedding active payer account association; the initial UI uses payer names. Existing historical associations can be preserved when that member becomes inactive.

The page shows cost, paid, outstanding and overpaid totals, expense records and a paginated payment report. Ceremony/category filters apply to both totals and records; the exact payer-name filter selects contributing expenses and matching individual payments. It does not change total expense costs or silently attribute another person's payments to that payer. Payment-report totals cover all matching pages. Categories and payer names use exact case-sensitive matching in this first version.

Archiving removes an expense from active lists, summaries and payment reports while retaining history. Removing a payment updates totals and records a private audit event. Existing ceremony references survive confirmed ceremony archive; new selections must use active ceremonies in the current wedding. No budget enforcement, spending approval, money transfer or accounting integration is added.

## Precision, consistency and retry behaviour

- Money inputs/API amounts are canonical integer-paise strings. Storage uses BSON Long, preserving Long on driver reads; calculation/INR conversion uses BigInt. No floating-point money arithmetic is used.
- Individual costs and total payments per expense are bounded to signed 64-bit positive range (cost may be zero). Aggregate totals remain decimal strings and may exceed that bound. Outstanding and overpaid are clamped separately for each expense before summation. An overpayment never offsets another vendor's outstanding amount.
- Writes run in MongoDB transactions with current account authority, wedding scope, parent serialization for event-reference checks and an atomic audit record. A late audit failure rolls back the expense/payment change. Both same-wedding team roles have the baseline operational permissions.
- PATCH, DELETE and payment actions require the expense `If-Match`. Responses include revision/ETag. Stale edits retain local form text; explicitly loading the latest expense discards those edits.
- Adding a payment also requires a stable `Idempotency-Key`. Current authorisation and ownership precede replay. Matching key/body does not append another payment, even with the original stale revision. A changed payload conflicts. Retry receipts survive edits/removals so an old retry cannot resurrect a removed payment. The response contains the current expense state for that original operation.
- The form retains the original payment payload/key after an uncertain network/server failure and offers a safe retry. It locks those fields and competing expense/payment controls until confirmation; an expired session returns to sign-in. Retry information is held in the mounted form, not browser persistent storage: keep it open after uncertainty and inspect payment history before starting a fresh form if the page was closed/reloaded.
- Operational bound: 500 accepted payment additions over an expense's lifetime, including removed entries' retry receipts. This makes the baseline's proposed 500-entry bound explicit while preserving replay protection after deletion. A higher-volume workflow would need a reviewed separate receipt/payment collection rather than silently dropping idempotency history.

## Persistence and routes

Explicit migration `006-expenses-payments` creates the expense validator and wedding/archive/list, event, category and payer indexes. It requires the website migration, is repeatable, takes the existing migration lock and seeds no business data. The application does not migrate at startup. Use root `npm run db:migrate` for development after isolated Atlas checks pass.

The baseline API routes are implemented: GET/POST `/expenses`, GET `/expenses/summary`, GET/PATCH/DELETE `/expenses/:id`, POST `/expenses/:id/payments`, PATCH/DELETE `/expenses/:id/payments/:paymentId`, and GET `/expense-payments`, all under `/api/v1` and the existing cookie/CSRF boundary. Lists use wedding/filter-bound cursors and a maximum page size of 100. Shared contracts export from `@wedding-suite/shared/expenses`.

Summary and payment-report calculations stream matching expense records with exact arithmetic; they do not truncate at the first page. This avoids an unbounded in-memory list but still scans the wedding's matching expense/payment records. Validate larger workloads before increasing beyond the pilot; concurrent list/summary refreshes are separate reads and can briefly show different snapshots while another team member saves.

## Acceptance

Credential-free checks cover precision/validation, the ₹80,000/₹20,000/₹30,000 example, overpayment separation, payment edit/removal, archive, payer reporting, cursor scope, replay/conflicts, concurrent revisions, rollback, wrong-wedding/invalid selections, disabled authority and HTTP auth/CSRF/preconditions.

The isolated Atlas suite additionally exercises real validators/BSON types/indexes, transactions/concurrency, active Manager access, audit rollback and archived ceremony references. The browser journey covers built assets with real Atlas: create an expense, split payments, edit/remove, filter, desktop/mobile layouts, stale edit retention/reload, archive and persistence after refresh. Test databases contain synthetic records and use guarded cleanup. In-memory browser runs are distinct from Atlas verification.

No live provider delivery or production deployment is part of M5A. Final results are recorded in PROJECT_STATUS.md.
