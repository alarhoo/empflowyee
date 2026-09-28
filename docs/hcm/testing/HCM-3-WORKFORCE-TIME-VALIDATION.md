# HCM-3 workforce time-context validation

Verified locally on 2026-09-28 against disposable PostgreSQL 17. The read-only
`WorkforceTimeContextBinder` is implemented by Workforce Foundation and exported
through its existing module. It binds an existing tenant transaction without a
human account requirement, supporting both authorized interactive commands and
the verified workload path. It creates no authority and opens no separate pool.

The projection reads one employment and its dated assignments in one SQL
snapshot, returning workforce/reference revisions, legal employer, worker type,
hire/service/end dates, organizational scope and location timezone/region.
Concurrent employments are never merged by worker ID. Missing establishment,
dates or timezone validity produce an explicit Unavailable result; there is no
invented schedule or service date. Consumers still own permission/scope checks
and must bind this input digest into previews/publication.

Executed checks:

- `workforce-time-context.database.spec.ts`: four passing tests for deterministic
  minimal projection and reference drift, two concurrent employments, incomplete
  and invalid-zone facts, dates outside employment, foreign tenant binding,
  unscoped pool rejection and impossible calendar dates.
- Workforce infrastructure and module TypeScript checks pass with
  `--noEmit --allowImportingTsExtensions`.
- Targeted ESLint has zero errors (one declaration-order warning).
- `pnpm nx run hcm-api:build` passes with the provider wired into the existing
  module. No app route, public DTO change, migration or seed change is required.

Run the suite with `pnpm exec vitest run --config tools/hcm-database/vitest.config.mts
libs/hcm/api/workforce-foundation/module/src/lib/workforce-time-context.database.spec.ts`.
The test harness alone creates/resets its disposable database. This validation
does not claim schedule resolution, leave conversion or Attendance app acceptance.
