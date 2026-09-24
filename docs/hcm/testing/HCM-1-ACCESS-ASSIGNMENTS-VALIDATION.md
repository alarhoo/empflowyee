# Access Assignments validation

Branch: `codex/hcm-1-access-assignments`, following the committed Role Management
Object Page correction. The [approved design](../apps/access-assignments/TDD.md)
and [explicit UX instruction](../roadmap/HCM-1-UX-REVISION.md) govern this slice.

## Delivered boundary

The assignment-owned application service lists accounts, resolves a selected
account, pages its role occurrences, searches role choices and grants/revokes one
role. Universal DTOs, Nest transport, consumer-owned account projection/revision
ports and Kysely adapters keep persistence out of Angular. Role Management keeps
its assignment-owned assignee projection and adds no assignment writer.

Native FlexibleColumnLayout retains begin-column filters and opens the selected
account in a shared Object Page with Overview and Roles. Selection is a query
parameter. Focused Signal Forms dialogs confirm the account, role and reason.
Server errors preserve drafts/retry keys; discard and pending-command guards
cover navigation/persona switches. The feature adds no CSS or business fixtures.

## Persistence and authorization

Forward SQL 000007 grants UPDATE on user_account.revision only. Runtime SQL
verification returns true for revision and false for email/enablement updates.
Identity-access retains account ownership. The explicit local database tool
applied one migration and zero new seed versions; existing Dunder Mifflin accounts,
roles, grants and entitlement data supply the app. No applied migration is edited.

Every command takes the existing tenant advisory lock, reloads permission and
entitlement, checks account revision and immutable grant occurrence, and retains
an enabled protected administrator before commit. Assignment, account revision,
safe audit and idempotency receipt share one transaction. Receipts bind target
and normalized body and never substitute for current authority. Successful
history persists after test cleanup; no fictitious audit events are seeded.

## Verification

- Full PostgreSQL suite: 62 tests across eight files pass, including seven new
  assignment API tests and all existing role/runtime/database regressions.
- Coverage includes actual foreign-tenant accounts/roles, disabled actors,
  missing permission/entitlement, unknown/duplicate controls, encoded account IDs,
  bounded cursors, empty/disabled accounts, duplicate grant, same-key replay,
  changed-target replay, stale occurrence, concurrent administrator revokes and
  complete rollback on database-injected audit failure.
- Existing foundation concurrency tests cover account-disable contention under
  the same lock. This does not claim an Identity Administration API is delivered.
- Five real-browser acceptance cases pass: persisted grant/revoke, failed-draft retry,
  native discard, all four themes at four viewport widths, zero axe violations,
  protected-administrator rejection, employee denial, tenant accent removal and
  cancelled browser-history navigation. Query changes run the native leave guard;
  cancelled navigation restores the history index.
- Production web/API builds, changed-feature/e2e lint, formatting, architecture,
  documentation links, 34 page templates and all 20 admitted-app readiness gates pass.

## Reproduction

```bash
pnpm hcm:db:up
pnpm hcm:db:test
pnpm dev:hcm-api --no-watch
pnpm dev:hcm
pnpm exec playwright test --config apps/hcm/web-e2e/local-launchpad.config.mts apps/hcm/web-e2e/live/access-assignments.spec.ts --workers=1
pnpm nx build hcm-web --configuration=production
pnpm nx build hcm-api
pnpm architecture:check
pnpm docs:check
pnpm ux:check-pages
pnpm hcm:app:readiness --admitted --check
```

Use the shell persona selector for David Wallace and open Access Assignments.
Do not edit browser source while acceptance runs. Screenshots are stored under
`.tmp/hcm-access-assignments/`. Browser tests remove only their own temporary role
and grant through the real APIs and restore the prior tenant accent in finally.

Rollback removes the catalogue activation and lazy route; it does not delete
committed grants, audit or receipt history. Migration 000007 is additive. The six
production-integration apps remain Planned and outside this local stage.
