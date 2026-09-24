# My Security validation

Branch: `codex/hcm-1-my-security`. The [approved design](../apps/my-security/TDD.md)
selects a native Standard Page for this self-only read model.

## Delivered behavior

The Nest APIs resolve identity from verified server context and reauthorize each
summary/role request against persisted account state, self permission and tenant
entitlement. No account or tenant selector exists. Summary contains only the
approved identity fields and explicitly local development session mode/expiry.
Assigned-role labels use bounded server search and stable label/ID cursors bound
to tenant, account and query. The feature introduces no assignment writer,
credentials, session inventory, revocation, MFA or password controls.

The Angular page uses native Page/Bar/Title, labeled Signal Forms, table and
refresh/retry controls. It consumes real HTTP data and cancels obsolete reads.
No CSS or fixture data is included. Role assignment ownership remains unchanged.
No schema migration, seed version or new grant is needed; existing approved
self-service permissions and persisted roles provide the data.

## Verification

- Five real PostgreSQL/Nest cases compare all four personas with storage, exercise
  actual assignment changes, bounded/literal search, cursor scope and tampering,
  rejected account/tenant selectors and unsupported commands, enabled state,
  business permission and entitlement denial, and actual foreign-tenant grants
  with an account ID matching the current account.
- All 83 PostgreSQL tests across twelve files pass, including existing identity
  lifecycle regression after sharing cursor helpers and safe transport handling.
- Three live-browser cases verify real own identity and roles, empty search,
  offline summary retry, persona switch/re-entry with prior identity removed,
  four themes at 390/768/1440/2560 widths, zero axe violations, no outer overflow,
  and persisted tenant-overlay removal. Native table cells are located by their
  accessible roles; the shell deliberately returns to the launchpad on persona
  changes before re-entry. No API mocks or business mutations are used.
- Desktop screenshot `.tmp/hcm-my-security/horizon-light.png` was inspected.
  Web/API production builds, affected-project lint, formatting, architecture,
  documentation, 41 native page templates and 20 admitted-app readiness gates pass.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:db:test
pnpm dev:hcm-api --no-watch
pnpm dev:hcm
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts apps/hcm/web-e2e/live/my-security.spec.ts --workers=1
pnpm nx run-many -t build --projects=hcm-web,hcm-api --parallel=2
pnpm architecture:check
pnpm docs:check
pnpm ux:check-pages
pnpm hcm:app:readiness --admitted --check
```

Any seeded persona can open My Security. Browser verification restores any tenant
accent changes in finally. Rollback deactivates the catalogue route; there are no
storage changes to reverse. Audit Log is next. Full HCM-1 is incomplete and all six
deferred integration apps remain Planned.
