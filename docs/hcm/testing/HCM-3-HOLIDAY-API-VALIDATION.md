# HCM-3 holiday draft API validation

Verified locally on 2026-09-28. The real NestJS Attendance module exposes five
Holiday Calendars endpoints: list/create, exact root/version read/replacement,
and successor creation. These use current authorization, tenant transactions,
encrypted command receipts and safe DTOs. Publication, retirement, assignment,
canonical grants/seeds and native UI acceptance remain pending; the app is Planned.

Migration 43 extends the existing hash-only Attendance continuation table with
closed app codes and generated typed tenant-composite calendar/schedule references.
Existing schedule rows are backfilled without changing handle semantics. List
queries select each root's latest version before filtering, use literal code/name
matching and bounded deterministic ordering, and bind continuation to the actor,
current grant, normalized query and source generation. Unknown/duplicate parameters,
forged/expired/stale/foreign handles and query parameters on exact-detail/writes fail.

Five real PostgreSQL/NestJS holiday HTTP tests pass. They exercise exact routes,
whole-draft replacement, same-key replay, private-field exclusion, latest-version
filtering, observed-date validation, fresh permission/entitlement checks, revoked
grants, cross-tenant denial and source-change invalidation. Cursor SQL tests prove
RLS, immutable runtime rows and wrong-family/foreign FK rejection. A transactional
upgrade fixture applies the actual forward migration over an existing schedule
cursor and proves its generated reference is preserved. Published source input
is arranged explicitly in test SQL; the unimplemented publication route returns 404.

The seven template HTTP regression tests also pass (12 combined). The five holiday
command tests and ten schedule command tests pass alongside the five holiday HTTP
tests (20 combined). Targeted ESLint, module TypeScript and the hcm-api webpack
build pass. Architecture and documentation checks pass; all 61 admitted apps are ready,
including HCM-3 23/23 with zero blockers. Readiness is a design gate, not app acceptance.

Codex technical review under the existing
[delegated authority](../roadmap/HCM-3-DESIGN-APPROVAL.md#authority) confirms conformance
to the [reviewed query design](HCM-3-HOLIDAY-QUERY-REVIEW.md). No separate human approval
or new business decision is claimed. No developer database was migrated or reset.

Reproduce with Docker and installed dependencies:

```sh
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/attendance/module/src/lib/holiday-calendars.database.spec.ts libs/hcm/api/attendance/module/src/lib/schedule-templates.database.spec.ts
pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/attendance/infrastructure/src/lib/holiday-commands.database.spec.ts libs/hcm/api/attendance/infrastructure/src/lib/schedule-commands.database.spec.ts libs/hcm/api/attendance/module/src/lib/holiday-calendars.database.spec.ts
pnpm exec tsc --noEmit --allowImportingTsExtensions -p libs/hcm/api/attendance/module/tsconfig.lib.json
pnpm exec nx build hcm-api
```

The test runner provisions and removes its disposable PostgreSQL database. Apply
migrations explicitly through the documented deployment/migration procedure before
using these endpoints against another database; ordinary API startup never migrates.

## Browser draft client

The Angular Attendance data-access library now exports `HolidayCalendarsApi` for
these five implemented routes. It passes server-owned list filters/continuations,
encodes exact root/version paths, and retains caller-provided idempotency keys and
the loaded revision for draft replacement. It exposes no publication operation.
Targeted Prettier, ESLint and the data-access TypeScript check pass; architecture
and documentation verification also pass. This client has no new business screen
or browser acceptance claim. The earlier 61/61 result above is historical: current
readiness is 60/61 pending [DEC-HCM3-024](HCM-3-HOLIDAY-PUBLICATION-QUESTION.md).

```sh
pnpm exec eslint libs/hcm/web/attendance/data-access/src/lib/holiday-calendars-api.ts libs/hcm/web/attendance/data-access/src/index.ts
pnpm exec tsc --noEmit --allowImportingTsExtensions -p libs/hcm/web/attendance/data-access/tsconfig.lib.json
```
