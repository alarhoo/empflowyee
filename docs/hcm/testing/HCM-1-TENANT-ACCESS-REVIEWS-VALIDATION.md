# Tenant Access Reviews validation

Branch: `codex/hcm-1-tenant-access-reviews`.

## Delivered behavior

The [approved design](../apps/tenant-access-reviews/TDD.md) uses native FCL with
server-owned filters/list in the begin column and an approved Object Page in the
mid column. Overview explains snapshot scope and closure; Assignment snapshot
shows historical account/role labels, decisions, drift, reasons and focused
commands. Selection is deep-linkable. Small label/reason creation and individual
commands use native dialogs, Signal Forms, dirty-leave confirmation, retained
failed drafts and same-key retry. There is no feature CSS or custom floorplan.

SQL migration 000009 creates tenant-owned review and snapshot tables with FORCE
RLS, composite tenant references, bounded columns and no runtime delete/truncate
rights. The explicit local provisioning command applied it to persistent hcm_db;
no review or audit history was seeded. Existing local records were preserved.

Nest endpoints reauthorize each transaction. Starting snapshots the actual grant
occurrences under the same tenant administration lock as assignment writes. Item
commands compare item revisions; decisions and refresh advance parent revisions.
Revoke uses the extracted assignment-owned operation on the same transaction,
including occurrence validation, account revision, audit and final-administrator
protection. Role Management and Access Assignments retain their existing API.

Stale evidence cannot be decided. Explicit refresh replaces it and resets Pending,
or records Removed when the occurrence is absent. Closure compares the parent
revision and rejects pending or stale retained evidence. Closed reviews are
read-only. Later grants are explicitly outside the snapshot. Audit events and
actor/operation/target/payload-bound receipts commit with the command; failed
transactions leave neither partial decisions nor success receipts.

## Verification

Nine real PostgreSQL/Nest cases cover snapshot contents, bounded cursor bindings,
replay, closure, drift, grant replacement, shared revocation, protected-admin
rollback, audit failure, strict transport, permission/entitlement denial, actual
foreign records, runtime RLS and privilege denial, empty snapshot closure and
competing decisions. The existing assignment regression also passes.

The full regression run plus affected foundation reruns verify all 109 tests
across seventeen files. Two exact inventory assertions were extended for the
approved migration/tables; existing assertions were retained. A further review
rerun verifies malformed year-zero cursors return 400 before reaching PostgreSQL.

Three browser acceptance cases pass: actual creation/retain/close and protected
administrator rejection, same-key offline retry, dirty cancellation, read-only
reopening, persona denial, tenant audit visibility and self-summary minimization;
the list and selected Object Page in all four Horizon/HER variants at
390/768/1440/2560 widths with zero axe violations and no outer overflow; and tenant
accent application/removal with exact restoration in finally. The expanded
32-view matrix uses a six-minute ceiling; its passing rerun took 2.7 minutes.
The list and selected Object Page captures under `.tmp/hcm-tenant-access-reviews`
were visually inspected. Persistent verification found both review tables with
FORCE RLS and one actual Closed review containing four Retain decisions.

Final web/API production builds, affected lint, Prettier, architecture and
documentation checks pass. Page structure covers 48 templates; all 20 admitted
local-app readiness checks pass. Existing foundation SQL-name lint warnings remain
unchanged; the new implementation and browser test lint with zero warnings.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:db:test
pnpm dev:hcm-api --no-watch
pnpm dev:hcm
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts apps/hcm/web-e2e/live/tenant-access-reviews.spec.ts --workers=1
pnpm nx run-many -t build --projects=hcm-web,hcm-api --parallel=2
pnpm architecture:check
pnpm docs:check
pnpm ux:check-pages
pnpm hcm:app:readiness --admitted --check
```

David Wallace can review actual local assignments. Browser acceptance creates
honest review/decision history through public commands; these records are retained
because the approved feature intentionally has no deletion command. Rollback
removes catalogue activation while preserving evidence; never drop populated
review tables as a UI rollback. My Notifications and My Notification Preferences
are next. The six deferred production-integration apps remain Planned.
