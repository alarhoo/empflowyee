# HCM-3 schedule seed defaults validation

Verified locally on 2026-09-28 through migration 42 and the canonical Dunder
Mifflin versioned seed. Two additive seed modules retain the original 28 modules:
`access.attendance@1` supplies five explicit template-operation grants to the
existing reference-data administrator; `attendance.configuration@1` stores the
incomplete draft form proposal. No published schedule, assignment, holiday or
actual attendance is seeded.

The proposal contains Mon–Fri 09:00–18:00 with 60 unplaced unpaid minutes and
Sat/Sun rest. It has no timezone, effective date, segments or resolved duration.
The additive `/api/v1/attendance/schedule-templates/defaults` endpoint returns
`DraftDefaults` under current read authority. It cannot be submitted as a complete
ScheduleDraft or used as a publication source. Missing/incomplete data yields
`record-incomplete`, never a browser fixture. Policy grace/rounding defaults will
be delivered with the separate policy seed; this slice does not claim those apps.

The canonical CLI apply/reset suite passes 13 tests with 30 module versions;
reapplying is a no-op. The ten PostgreSQL draft/publication regression tests pass
using the canonical template grants. The extended HTTP suite passes seven tests,
including real default reads, no guessed placement/zone, unchanged defaults on
reseed, permission/tenant isolation and refused seed reset over real Attendance
evidence. The reset refusal rolls back earlier reset effects and preserves all
seed history, configuration and operation authority.

Both seed tables deny foreign-tenant reads and runtime UPDATE. Readiness passes
all 61 admitted apps, including all 23 HCM-3 designs; architecture/documentation
checks also pass.

The API build, module TypeScript check, targeted ESLint and spine seed-generation
check pass. The reviewed representation is documented in the
[seed review](HCM-3-SEED-DEFAULTS-REVIEW.md). UI acceptance remains pending;
Work Schedule Templates and the other HCM-3 apps remain Planned.
