# Domain Configuration validation

Branch: `codex/hcm-1-domain-configuration`. The [approved design](../apps/domain-configuration/TDD.md) selects a native Standard Page for this singleton projection.

## Delivered behavior

The authorized Nest endpoint reads the current tenant's slug, lifecycle state and
hostnames through a consumer-owned identity read port. Account/runtime retain
ownership. The global hostname routing index is explicitly restricted to the
verified tenant. No migration, seed, write grant, DNS lookup, configuration command
or fictitious verification status is added.

The lazy Angular feature uses native Page/Bar/Title, text, message strips and
refresh/retry actions. It consumes the real API, cancels prior-context requests and
clears prior data on loading/failure. Empty hostname projection is distinct from
service failure. No feature CSS or frontend fixture data is present.

## Verification

Four real Nest/PostgreSQL cases cover exact storage projection, actual foreign
hostname exclusion, rejected query/tenant controls and mutation methods, disabled
and unauthorized actors, licensing, empty projection and a real SQL outage with
recovery. Empty projection is tested through the authenticated read port after
hostname removal because a new HTTP request cannot resolve a removed hostname.
All 78 database tests in 11 files pass.

Three real-browser cases cover offline refresh/retry, persona access loss,
read-only presentation, all four themes at 390/768/1440/2560 widths, no outer
overflow, zero axe violations and persisted tenant-overlay removal. Native message
strips are asserted through their accessible role/name. The stale development
bundle after adding a library alias required a server restart before acceptance.
The desktop screenshot under `.tmp/hcm-domain-configuration/` was visually checked.

Production web/API builds, affected-project lint, formatting, architecture,
documentation, 40 page templates and all 20 admitted-app readiness gates pass.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:db:test
pnpm dev:hcm-api --no-watch
pnpm dev:hcm
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts apps/hcm/web-e2e/live/domain-configuration.spec.ts --workers=1
pnpm nx run-many -t build --projects=hcm-web,hcm-api --parallel=2
pnpm architecture:check
pnpm docs:check
pnpm ux:check-pages
pnpm hcm:app:readiness --admitted --check
```

Select David Wallace and open Domain Configuration. Browser verification restores
the tenant accent in finally; it makes no business mutations. Rollback removes
catalogue activation and the lazy route, without altering persistence. My Security
is next. The six deferred integration apps stay Planned; full HCM-1 is incomplete.
