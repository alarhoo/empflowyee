# App Catalogue Configuration validation

Branch: `codex/hcm-1-app-catalogue-configuration`. The [approved design](../apps/app-catalogue-configuration/TDD.md) governs this read-only slice.

## Delivered behavior

The API projects all 170 canonical apps, their Space/Page/Group placements and
persisted tenant entitlements. A bounded account picker and discovery endpoint
explain effective grants, entitlement, enabled state and role placement without
impersonation. The launchpad and API share pure discovery predicates. Business
API authorization remains separate. There are no configuration mutation routes,
new tables, migrations, seed versions or commercial entitlement edits.

Native FlexibleColumnLayout keeps filters/list in the begin column and Overview,
Placements and Discovery in a mid-column Object Page. Real HTTP data, Signal Forms,
UI5 native tables/forms/text and approved floorplans provide the entire screen.
No feature CSS or frontend business fixtures are present. Pending requests are
cancelled on context replacement; stale subject responses cannot overwrite the
current discovery explanation.

## Verification

- Five real Nest/PostgreSQL cases cover canonical inventory, minimal bounded
  account projection, literal search, cursor binding, strict controls, all four
  discovery denial reasons, same-tenant subjects, actual foreign-tenant data,
  permission/entitlement/forged-persona denial and unsupported mutation methods.
- All 74 database tests in ten files pass; six navigation regression tests pass.
- Four live-browser cases cover inventory and Planned state, account discovery
  without persona changes, offline failure/retry, employee denial, focus return,
  all four themes at 390/768/1440/2560 widths, zero axe violations, no outer overflow
  and actual tenant-overlay removal. The initial route load during compilation
  failed; its focused rerun passed after the server was ready. No API mocks used.
- Desktop screenshot `.tmp/hcm-catalogue-configuration/horizon-light.png` was
  visually inspected. All 39 page templates pass structural checks.
- Production web/API builds, changed-project lint, formatting, architecture,
  documentation and all 20 admitted-app readiness checks pass.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:db:test
pnpm dev:hcm-api --no-watch
pnpm dev:hcm
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts apps/hcm/web-e2e/live/catalogue-configuration.spec.ts --workers=1
pnpm nx run-many -t build --projects=hcm-web,hcm-api --parallel=2
pnpm architecture:check
pnpm docs:check
pnpm ux:check-pages
pnpm hcm:app:readiness --admitted --check
```

Select David Wallace and open App Catalogue Configuration. Browser verification
restores the tenant accent in finally. No business data is created or removed.
Rollback deactivates the catalogue entry and lazy route without changing storage.
The six deferred integration apps remain Planned. Domain Configuration is next;
this is not full HCM-1 completion.
