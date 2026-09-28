# HCM-3 policy and holiday storage validation

Verified locally on 2026-09-28 against disposable PostgreSQL 17. Forward migration
`000038_attendance_policy_holidays.sql` adds eight Attendance-owned tables for
policy/calendar roots, immutable versions, typed approval rules/holidays and
dated assignments. Each table uses ENABLE/FORCE RLS, composite tenant references
and restricted runtime grants. Published versions cannot overlap for one owner.
Rule selector fields and mandatory independence are constrained in SQL; enabled
overtime requires complete settings and a manager rule before publication.

Seven configuration database tests and eight schedule database tests pass:

- Direct-SQL dependent-field and selector checks, including foreign named actors.
- Independent manager requirement and contiguous stages at publication.
- Exact holiday wall-time precision and explicit observed-date coverage.
- Published version/child immutability and no runtime version deletion.
- Assignment overlap/date coverage and explicit end-only supersession.
- Real second-tenant visibility/reference denial, all RLS flags and absent context.
- Safe Kysely DTO projections and transaction-local context after pool reuse.
- Two-connection races for both policy rules and holidays: a child edit blocked
  by publication observes Published and fails instead of changing evidence.

The forward migration also fixes schedule assignment ending after retirement:
existing coverage may be shortened with the next revision, never extended or
reopened. Original schedule migration bytes remain unchanged. The added regression
test checks this behavior using the runtime role.

Run `pnpm exec vitest run --config tools/hcm-database/vitest.config.mts
libs/hcm/api/attendance/infrastructure/src/lib/attendance-configuration.database.spec.ts
libs/hcm/api/attendance/infrastructure/src/lib/attendance-schedules.database.spec.ts`.
Infrastructure TypeScript, targeted ESLint (zero errors; SQL-name warnings),
architecture, documentation and HCM-3 readiness (23/23, zero blockers) pass.

These are storage and projection checks. Human command authorization, scoped
publication impact/DST collision previews, receipts/outbox, worker handlers,
development seed examples and business UI acceptance remain required. No developer
database was reset and no API route or completed app is claimed by this evidence.
