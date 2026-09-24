# Audit Log validation

Branch: `codex/hcm-1-audit-log`. The [approved design](../apps/audit-log/TDD.md)
uses a native Dynamic Page with labeled Signal Forms and a responsive native table.
All safe event information is visible in the row/pop-in; there is no separate
detail workflow, dialog, custom CSS or business mutation.

## Delivered behavior

`GET /api/v1/audit/events` reauthorizes the enabled actor, business permission and
entitlement inside the tenant transaction. Kysely queries the existing append-only
audit store, selecting actual successful registered business events only. Explicit
from/to/action/outcome/actor filters and time/ID keyset cursors retain PostgreSQL
microsecond precision. Cursors bind every filter, limit, direction and tenant.
The action-specific summary projection excludes arbitrary JSON keys. Reads never
append recursive events. No migration, seed change or new runtime grant is needed.

The Angular screen consumes this real API, cancels obsolete requests on context
changes, preserves failed filter input, distinguishes errors from empty success,
and offers bounded continuation. App roots only compose the module/lazy route.
No production integration or export creation is included.

## Verification

- Five Nest/PostgreSQL cases in
  `libs/hcm/api/audit/module/src/lib/audit-log.database.spec.ts` verify real command
  evidence, empty seeded history, microsecond/equal-time boundaries, both sort
  directions, cursor scope/tampering, invalid/unknown selectors, safe projections,
  database outage recovery, enabled-account/permission/entitlement denial, actual
  foreign-tenant data isolation, unsupported mutation/export routes and nonrecursive reads.
- All 88 PostgreSQL tests across thirteen files pass.
- Three live browser cases in `apps/hcm/web-e2e/live/audit-log.spec.ts` pass against
  the persistent local database. They verify actual history, filters, invalid
  bounds, empty results, offline retry, retained input, persona denial, all four
  Horizon/HER variants at 390/768/1440/2560 widths, zero axe violations, no outer
  overflow, and tenant-accent application/removal with exact restoration in finally.
- `.tmp/hcm-audit-log/horizon-light.png` was inspected. Native responsive pop-ins
  preserve safe summaries and correlation identifiers without an object dialog.
- Production web/API builds, affected lint, formatting, architecture, documentation,
  42 page templates and all 20 admitted-app readiness gates pass.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:db:test
pnpm dev:hcm-api --no-watch
pnpm dev:hcm
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts apps/hcm/web-e2e/live/audit-log.spec.ts --workers=1
pnpm nx run-many -t build --projects=hcm-web,hcm-api --parallel=2
pnpm architecture:check
pnpm docs:check
pnpm ux:check-pages
pnpm hcm:app:readiness --admitted --check
```

Use David Wallace to open Audit Log. Rollback deactivates its catalogue route;
there are no storage changes to reverse. My Activity is next. Thirteen approved
local apps remain Planned, as do all six deferred integration apps.
