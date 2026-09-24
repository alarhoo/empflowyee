# Sensitive Access Log validation

Branch: `codex/hcm-1-sensitive-access-log`. The [approved design](../apps/sensitive-access-log/TDD.md)
uses the native Dynamic Page, labeled Signal Forms and responsive native table.
There is no separate object-detail workflow, dialog or feature CSS.

## Delivered behavior

`GET /api/v1/audit/sensitive-access` reauthorizes the enabled actor, explicit
sensitive-log operation permission and audit entitlement in the tenant transaction.
SQL selects only the three approved document download actions. Authorization
remains Authorized; observed server completion/failure has a separate phase and
related authorization ID. No completion or client receipt is inferred from an
initial authorization. Inconsistent stored phases fail safely rather than produce
misleading evidence. The projection selects no filename, content or raw summary;
no payload-derived sensitive summary fields are approved, so summary is empty.

Date/actor/action/outcome/sort/limit filters and microsecond time/ID keyset cursors
are server-owned and bound to the complete tenant/query/projection. The UI has no
content-access link or download capability. No migration or seed change is needed.
Real download producers join in the later document slice. The current persistent
local view is honestly empty; populated stream cases use disposable test storage
only, and no fake local historical rows were created.

## Verification

- Four Nest/PostgreSQL cases in
  `libs/hcm/api/audit/module/src/lib/sensitive-access-log.database.spec.ts` verify
  empty source storage; authorization with unknown completion; completed/failed
  stream links; safe exact DTO fields; excluded payloads; equal/microsecond time
  boundaries; both cursor directions; changed query and endpoint scope; invalid
  selectors; enabled-account/permission/entitlement denial; actual foreign rows;
  inconsistent phases; outage recovery; and no mutation/download/recursive events.
- All 100 PostgreSQL tests across sixteen files pass, including existing role,
  assignment, identity and all sibling audit-read regressions.
- Three real local browser cases in `apps/hcm/web-e2e/live/sensitive-access-log.spec.ts`
  cover empty results, explicit stream explanation, action/outcome filters, invalid
  dates, retained filters, offline retry, persona denial, four themes at
  390/768/1440/2560 widths, zero axe violations, no outer overflow, and tenant-accent
  application/removal with exact restoration in finally. Responsive captures wait
  for native filter reflow. Populated browser stream evidence remains part of the
  later real document-producer acceptance rather than fabricated local history.
- `.tmp/hcm-sensitive-access-log/horizon-light.png` was inspected. Web/API production
  builds, affected lint, format, architecture, documentation, 45 page templates and
  all 20 admitted-app readiness gates pass.

## Reproduction

```bash
pnpm hcm:db:test
pnpm dev:hcm-api --no-watch
pnpm dev:hcm
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts apps/hcm/web-e2e/live/sensitive-access-log.spec.ts --workers=1
pnpm nx run-many -t build --projects=hcm-web,hcm-api --parallel=2
pnpm architecture:check
pnpm docs:check
pnpm ux:check-pages
pnpm hcm:app:readiness --admitted --check
```

David Wallace can open this read-only view. Rollback deactivates its catalogue
route; no storage rollback is needed. Tenant Access Reviews is next. Ten approved
local apps and all six deferred integration apps remain Planned.
