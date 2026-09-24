# Notification self-service validation

Branch: `codex/hcm-1-notifications-self-service`.

## Delivered behavior

My Notifications uses the approved native Dynamic Page with server-owned filters,
cursor pagination, plain-text messages and explicit revisioned mark-read actions.
My Notification Preferences uses the approved native Standard Page with Signal
Forms, per-category Save/Cancel, retained failed drafts and dirty-leave protection.
Both use real NestJS APIs and universal DTOs; neither adds feature CSS or fixtures.

SQL migration 000010 creates notification preferences, immutable delivery intents,
inbox messages and command receipts. All four tables use FORCE RLS and composite
tenant/account references. Runtime may update only preferences and read-state
columns; it cannot rewrite inbox bodies or delete records. The persistent local
hcm_db has the migration applied. No fabricated inbox or audit history was seeded.

Each read/write reauthorizes persisted permissions and entitlement. Inbox queries
and category choices belong to the exact account, including when another account
shares its person. Absent category preferences return enabled/revision zero without
inserting rows. Commands use expected revisions, actor-bound retry receipts and
atomic audit. Mark-read preserves its first timestamp. Safe audit projections expose
changed field names, never notification text.

Document producers and template/rule administration are subsequent approved slices.
The local inbox is honestly empty until those producers deliver real messages.
The planned Document Requests route has no enabled inbox navigation action.

## Verification

All 116 real PostgreSQL/Nest tests in 18 files pass. Seven new cases cover exact
account scope, real foreign records/RLS, immutable evidence privileges, cursor and
literal-search behavior, first-read timestamps, revision conflicts, successful
receipt replay after authority checks, concurrent commands, preference defaults,
disabled actors/entitlements and transaction rollback on audit failure.

Four browser cases pass across the initial matrix run and targeted assertion
reruns: real preference saves/reload with exact prior effective choice restored in
finally, independent cancellation, offline same-choice retry, discard protection;
real inbox filtering and read retry; both pages in four Horizon/HER variants at
390/768/1440/2560 widths with zero axe violations and no outer horizontal overflow;
and tenant accent application/removal with exact restoration. UI5 message-strip
assertions use accessible names because text is slotted. Captures under
`.tmp/hcm-notifications` were inspected for the native page/form/table layouts.
Populated inbox browser acceptance belongs to the later real document producer;
SQL-backed API tests already cover populated inbox reads and mark-read writes.

Production web/API builds, new-project lint, browser lint, formatting, architecture,
documentation and 50 page-template structure checks pass. All 20 admitted app
designs pass readiness; this does not mark the remaining seven local or six
deferred production-integration apps implemented.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:db:test
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts notification-self-service.spec.ts
pnpm architecture:check
pnpm ux:check-pages
pnpm docs:check
node tools/hcm-factory/check-readiness.mjs --admitted --check
```

Start `pnpm dev:hcm-api --no-watch` and the HCM web server on port 4302 before
browser acceptance. On hosts affected by Nx worker/daemon startup issues, set
`NX_DAEMON=false` and `NX_ISOLATE_PLUGINS=false` for the validation process.
