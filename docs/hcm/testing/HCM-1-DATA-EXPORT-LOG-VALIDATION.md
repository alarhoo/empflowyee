# Data Export Log validation

Branch: `codex/hcm-1-data-export-log`. The [approved design](../apps/data-export-log/TDD.md)
selects native Dynamic Page and responsive table. Rows have no separate object
workflow or dialog. The feature contains no CSS or business fixture data.

## Delivered behavior and limits

`GET /api/v1/audit/exports` reauthorizes the enabled actor, explicit export-log
permission and audit entitlement inside the verified tenant transaction. It queries
real PostgreSQL audit storage by tenant/category and the approved producer registry.
That registry is intentionally empty: export-producing capabilities and their event
schemas remain deferred. Unregistered inserted exports are not accepted as evidence.
This is a real read-only capability, not an exporter or historical fixture display.
No mutation, download URL, source payload or diagnostic summary is exposed.

Date/actor/sort/limit controls are bounded. Invented action/outcome values are
rejected while no values are registered; empty selectors are omitted from the UI.
The cursor format shares the existing tenant/filter binding and precise timestamp
logic, with a distinct export projection. No actual export pagination or populated
export UI is claimed verified: adding a real producer requires its own reviewed
schema and populated-row acceptance tests. No migration or seed change is needed.

## Verification

- Four real Nest/PostgreSQL cases in
  `libs/hcm/api/audit/module/src/lib/data-export-log.database.spec.ts` cover empty
  storage, an actual business command, rejection of unregistered export rows,
  malformed/unsupported query controls and cursors, precise date-bound validation,
  both sort directions, enabled-account/permission/entitlement denial, foreign
  tenant rows, outage recovery, unsupported mutations/download and nonrecursive reads.
- All 96 PostgreSQL tests across fifteen files pass, including audit/self-history
  pagination and microsecond boundary regression.
- Three live browser cases in `apps/hcm/web-e2e/live/data-export-log.spec.ts` cover
  real empty results, retained filters, invalid dates, offline retry, persona
  denial, four themes at 390/768/1440/2560 widths, zero axe violations, no outer
  overflow and persisted tenant-accent removal. The prior accent is restored in finally.
- `.tmp/hcm-data-export-log/horizon-light.png` was inspected. Web/API production
  builds, affected lint, formatting, architecture, documentation, 44 page templates
  and all 20 admitted-app readiness gates pass.

## Reproduction

```bash
pnpm hcm:db:test
pnpm dev:hcm-api --no-watch
pnpm dev:hcm
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts apps/hcm/web-e2e/live/data-export-log.spec.ts --workers=1
pnpm nx run-many -t build --projects=hcm-web,hcm-api --parallel=2
pnpm architecture:check
pnpm docs:check
pnpm ux:check-pages
pnpm hcm:app:readiness --admitted --check
```

David Wallace can open this read-only view. Rollback deactivates its catalogue
route; no storage rollback is needed. Sensitive Access Log is next. Eleven approved
local apps and all six deferred integration apps remain Planned.
