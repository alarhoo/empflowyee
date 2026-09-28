# HCM-3 schedule storage validation

Verified locally on 2026-09-28 against disposable PostgreSQL 17. Forward migration
`000037_attendance_schedules.sql` adds Attendance-owned schedule identities,
versions, seven-day patterns, exact-time segments and typed dated scope assignments.
All five tables enforce ENABLE/FORCE RLS and tenant-composite references. Published
content is immutable; retirement changes lifecycle only. Draft child replacement
is allowed under a parent-version lock, while published children cannot be edited
or deleted. The application layer must still enforce current actor permissions,
preview impact, source revisions, receipts and audit before publication.

Seven real PostgreSQL tests pass in
`libs/hcm/api/attendance/infrastructure/src/lib/attendance-schedules.database.spec.ts`:

- Complete publication, immutable versions/children and retirement-only lifecycle.
- Missing weekday, rest-with-work and split-shift publication rejection.
- Overlapping published versions, sub-millisecond input and incomplete rest policy.
- Draft/template assignment denial, exactly-one typed scope, date coverage and
  equal-target date overlap rejection.
- Runtime tenant RLS, composite actor ownership and no-context read denial.
- Explicit DTO projection without persistence fields and pooled context reuse.
- Two-connection publication/child-edit race: the blocked editor observes the
  newly Published state and cannot modify its evidence.

Run with `pnpm exec vitest run --config tools/hcm-database/vitest.config.mts
libs/hcm/api/attendance/infrastructure/src/lib/attendance-schedules.database.spec.ts`.
Targeted ESLint reports zero errors (SQL field-name warnings only); infrastructure
TypeScript, architecture and documentation checks pass. The suite's migration
and seeds run only in the disposable harness; developer databases are unchanged.

The repository exposes a Kysely version reader, not a public API or completed app.
Source command authorization/impact, shift/policy/holiday persistence, worker
handlers, versioned development examples and UI acceptance remain to be delivered.
