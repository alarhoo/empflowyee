# Identity Administration validation

Branch: `codex/hcm-1-identity-administration`, following the completed Role Management
and Access Assignments slices. The [approved design](../apps/identity-administration/TDD.md)
and [UX instruction](../roadmap/HCM-1-UX-REVISION.md) govern this delivery.

## Delivered boundary

Universal identity DTOs, framework-independent domain/application ports, Kysely
adapters and Nest transport implement bounded account list/detail, a read-only
person picker, account creation and enablement. Names and person records stay
workforce-owned. Account identity fields are immutable. Creation issues no
credentials, invitation, development persona or role grant.

Native FlexibleColumnLayout retains account filters/list in the begin column;
an Object Page provides Overview and Roles in the mid column. Three-field create
and reasoned enable/disable use focused Signal Forms dialogs. Contextual role data
uses the existing assignment-owned API and links to Access Assignments; identity
contains no assignment writer. The feature has no CSS or business fixtures.

## Persistence and authorization

Forward SQL 000008 adds account creation/update attribution and the domain-owned
identity_command_receipt table, with forced RLS. Runtime receives column-limited
account creation/lifecycle grants; it cannot update email/person linkage or delete
accounts. The explicit local database tool applied one migration and no seed
versions. Existing Dunder Mifflin people, accounts and authority provide real data.

Every mutation reauthorizes after taking the access-control tenant lock, checks the
shared account revision and preserves an enabled protected administrator. Account,
audit and receipt commit atomically. Fresh authority is required for receipt replay.
Safe account audit contains the opaque target, reason and enabled state, never
copied email/name values. Disabling a persona prevents its next runtime request.

## Verification

- Seven actual Nest/PostgreSQL integration cases cover account/person pagination,
  literal search, strict controls, case-insensitive email uniqueness, creation
  without grants/personas, attribution, replay/target conflict, stale revision,
  disable/enable, disabled actors, permission/entitlement denial and foreign data.
- Concurrent account disable versus assignment revoke permits only one conflicting
  reduction to commit. Last-administrator rejection leaves state unchanged.
- An injected audit failure rolls back account creation and its receipt; retry
  then succeeds. Non-owner runtime queries prove forced receipt RLS, negative
  foreign-tenant access and restricted account-column privileges.
- Real-browser acceptance exercises create/enable/disable, failed-draft retry,
  dirty cancel, contextual navigation, administrator rejection, employee denial,
  read-only capability removal, all four themes at 390/768/1440/2560 widths, focus,
  zero axe violations and tenant-overlay removal. Screenshots are under
  `.tmp/hcm-identity-administration/`; the desktop native composition was inspected.

All 69 PostgreSQL tests across nine files and five real-browser cases pass.
Production web/API builds, feature/API/root lint, formatting, architecture,
documentation links, all 37 page templates and all 20 admitted-app readiness gates
pass. No full HCM-1 completion is claimed.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:db:test
pnpm dev:hcm-api --no-watch
pnpm dev:hcm
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts apps/hcm/web-e2e/live/identity-administration.spec.ts --workers=1
pnpm nx build hcm-web --configuration=production
pnpm nx build hcm-api
pnpm architecture:check
pnpm docs:check
pnpm ux:check-pages
pnpm hcm:app:readiness --admitted --check
```

Select David Wallace and open Identity Administration. Browser tests remove only
their unique, ungranted verification account via scoped test cleanup (there is no
product delete operation), retain real audit/receipt history and restore tenant
accent/permission changes in finally. Do not edit browser source during acceptance.

Rollback removes catalogue activation and the lazy route; it does not rewrite
applied migrations or remove real business history. The six production-integration
apps remain Planned. App Catalogue Configuration is the next approved slice.
