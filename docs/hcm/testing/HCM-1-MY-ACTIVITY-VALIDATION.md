# My Activity validation

Branch: `codex/hcm-1-my-activity`. The [approved design](../apps/my-activity/TDD.md)
uses the existing native Dynamic Page and responsive table with labeled Signal
Forms. All self-safe information is in the row; no separate object detail, dialog,
feature CSS, export or mutation exists.

## Delivered behavior

`GET /api/v1/audit/me/activity` checks the self business permission and audit
entitlement against current persisted authority. The audit-owned adapter forces
the actor from verified context, even for tenant administrators. It shares exact
time/ID pagination with Audit Log, binding continuation to the tenant, actor,
projection and all query controls. Explicit DTO projection excludes actor,
request correlation, arbitrary JSON and operator-entered reasons. Only approved
self-safe summary fields are eligible; current producers supply changedFields.
The frontend never supplies an actor selector and cancels old-context reads.

No migration, seed change or new runtime grant is needed. Successful historical
business commands remain the only source of real local activity. An empty self
history is valid; database failure is an error, never manufactured empty success.

## Verification

- Four real Nest/PostgreSQL cases in
  `libs/hcm/api/audit/module/src/lib/my-activity.database.spec.ts` cover real
  command evidence, all four personas, equal-time and microsecond cursor ordering,
  changed controls/actor/projection, forbidden selectors, denied authority,
  a foreign tenant using the same actor ID, safe DTO fields, database recovery,
  unsupported mutation/export routes and nonrecursive reads.
- All 92 PostgreSQL tests across fourteen files pass, including existing tenant
  Audit Log tests after extracting the shared business-event query.
- Three live browser cases in `apps/hcm/web-e2e/live/my-activity.spec.ts` exercise
  real own history, forbidden diagnostic fields absent, date filtering, invalid
  bounds, retry, persona re-entry, four themes at 390/768/1440/2560 widths, zero
  axe violations, no outer overflow and persisted tenant-overlay removal.
  Tenant branding is restored exactly in finally; no business rows are fabricated.
- `.tmp/hcm-my-activity/horizon-light.png` was inspected. Production web/API builds,
  affected lint, format, architecture, documentation, 43 page templates and all
  20 admitted-app readiness gates pass.

## Reproduction

```bash
pnpm hcm:db:test
pnpm dev:hcm-api --no-watch
pnpm dev:hcm
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts apps/hcm/web-e2e/live/my-activity.spec.ts --workers=1
pnpm nx run-many -t build --projects=hcm-web,hcm-api --parallel=2
pnpm architecture:check
pnpm docs:check
pnpm ux:check-pages
pnpm hcm:app:readiness --admitted --check
```

Any enabled development persona can open My Activity; David has evidence from
implemented administrative commands. Rollback deactivates the catalogue route;
no storage rollback is needed. Data Export Log is next. Twelve approved local
apps and all six deferred integration apps remain Planned.
