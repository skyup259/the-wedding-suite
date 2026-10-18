# Wedding website and ceremonies

Milestone M3, 18 October 2026 (Asia/Kolkata). See PROJECT_STATUS.md for actual verification and deployment state. M2 checkpoint `27d396a` is pushed to origin/develop; M3 is developed on feature/wedding-website-events. The owner authorised continuing while deferring personal M2 review; controlled Resend/production acceptance remains separate.

## Team workflow

1. Open **Manage ceremonies** from the dashboard. Add a ceremony with a start time in the wedding timezone. Drafts may omit venue details/contacts; completing them is required for publication. Save errors preserve entered fields. Edit status explicitly: Not started, In progress or Completed. Equal-time events use the editable order number as a tie-breaker.
2. Open **Manage wedding website**. Edit partner names, main date/timezone, introduction, welcome message, theme and supported accent colour. Save the draft, then select **Preview saved website**. Unsaved form changes are not included. Preview is available only to the authenticated wedding team.
3. Preview renders the same guest model as the public site. Select **Publish website** to publish the revision currently shown. First publication requires at least one active ceremony, with venue name/address and one or two valid contacts for every active ceremony. This ensures the first public site has a usable schedule. If another team member edited it, reload the preview before publishing.
4. Share `/w/<slug>` only after publication. Later saved edits become live without republishing. Themes change presentation while retaining content and links. **Unpublish** closes new anonymous API/page requests; the address remains reserved. Content already viewed or copied cannot be recalled.
5. Use **Latest announcement** for one guest-facing update. An empty save removes it. Ceremony archiving keeps history; a confirmation is required, with a second explicit confirmation when linked records exist. Published sites must retain at least one complete active ceremony; unpublish first if clearing the entire schedule.

Both Admin and Manager can edit content, ceremonies and publication. Only Admin retains team-access privileges. The server derives wedding scope from the authenticated account and revalidates account authority inside write transactions. No account can edit another wedding's resources.

## Guest experience

Traditional uses framed stationery and terracotta paper; Floral uses botanical gradients, rounded cards and olive paper; Minimal uses clean typography and open spacing. The stable identifiers remain traditional/floral/minimal, matching the existing contracts. These are implementation presentations based on the reference directions, not a claim that every static mockup was reproduced. The reference directory remains unchanged.

All guests see the full active schedule, venue directions and tap-to-call contacts. In-progress ceremonies are shown together when they overlap. The next future Not started ceremony is shown when none is active. Overdue Not started ceremonies remain visibly Not started; the clock never changes status. Guest timestamps/times use the stored wedding timezone.

The guest page polls every 25 seconds while active, refreshes on visibility/focus return and displays the last successful check. A refresh failure retains the last schedule with an explicit error; a 404 after unpublication hides the cached content. New public requests always require published state. No family/contact-list, account, audit, private-gallery or financial data enters the public projection. Event contacts are intentionally public under the PRD.

Production HTML at `/w/:slug` has escaped names/description and Open Graph metadata derived only from published content. Vite development navigation uses the client title; server-generated social metadata is verified using built assets. No unmanaged images, private media or signed URLs are used in metadata or decorative covers.

## Persistence and concurrency

Apply migration `003-wedding-events` through root `npm run db:migrate`; migrations never run at startup or seed business data. Migration 003 adds the events validator and chronological wedding/event index. Existing wedding records remain compatible with the earlier foundation schema. It does not create photo/streaming jobs.

Every content/event mutation writes the parent wedding revision, updated time and actor in the same transaction as the event/audit write. This serializes publication validation against concurrent event edits. Event changes also have their own revision. PATCH, archive, publish/unpublish and announcement actions require `If-Match`: missing 428, stale 412. The UI preserves unsaved edits after conflicts and offers an explicit reload/discard action. New event creation is an explicit exception because no event revision exists yet. The preview response includes the wedding revision used for publication.

Draft addresses regenerate only when partner names/main date change before first publication; unrelated saves preserve a collision-suffixed signup address. A changed draft address that collides returns 409 rather than overwriting another wedding. First publication locks the slug permanently, including after unpublishing.

Main-date/timezone changes recalculate authoritative photo expiry and increment retentionVersion when it changes. An extension is refused after cleanup is running, complete or failed, because deletion may already have started; changing a date cannot restore deleted media. There is no photo worker in this milestone. Future media jobs must continue checking the authoritative wedding retention version.

Archive checks count wedding-scoped invitation/task/expense/photo/submission references and never cascade-delete them. Future modules must revalidate active event references inside their own write transactions. Current invitation/task/photo/expense creation remains unavailable; reference guards are tested using synthetic records.

Times are stored as UTC instants. The frontend reuses pinned Luxon 3.7.2 to convert local ceremony inputs using the wedding timezone. Nonexistent or ambiguous DST local times receive an error rather than silently shifting the scheduled time. Guest display uses Intl. Timezone changes keep existing event instants fixed; review their displayed local times afterwards.

## Scope and verification

API routes include private wedding/settings/themes/preview/publication/announcement, event create/read/partial edit/archive, and an overview projection of the currently available wedding/event information. Public wedding/events/today routes expose whitelisted fields only. The small per-wedding ceremony list returns the complete schedule, with no-more-pages metadata, rather than truncating a guest's schedule. Only implemented modules appear in navigation.

Managed cover selection/upload waits for M6; all cover IDs are null in public projections. Streaming configuration is deliberately unavailable until M7 (`stream` currently accepts null only). Families/invitations, RSVP, guest caps, expenses, tasks, photo uploads/gallery, vendor search and production hosting are not added by M3. No RSVP controls from the reference mockups were imported.

Use root `npm run check`, `npm run test:integration`, and `npm run test:e2e`. The integration command uses guarded temporary Atlas databases. Default browser tests use real Atlas, built assets and private temporary outboxes, and never modify the development wedding. The separate test:e2e:local mode remains a substitute-only check, not evidence of MongoDB persistence.

Before production, complete the owner walkthrough, HTTPS/proxy/session settings, CI/staging, provider acceptance and backup/restore checks. PROJECT_STATUS.md distinguishes completed checks from these remaining operating requirements.
