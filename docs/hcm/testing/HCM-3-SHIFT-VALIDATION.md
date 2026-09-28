# HCM-3 reusable shift foundation validation

Verified locally on 2026-09-28. The runtime-universal ShiftDraft parser reuses
schedule endpoint validation, rejects split shifts and requires explicit zone
and optional minimum-rest mode. Forward migration `000039_attendance_shifts.sql`
adds tenant-owned shift/version/segment tables with RLS, immutable publication,
same-owner supersession references and published effective-range exclusions.
The Kysely reader returns the declared shift DTO only.

All 24 Attendance contract/domain tests pass, including two new shift cases.
All nine configuration database tests pass, including shift publication geometry,
sub-millisecond rejection, immutable children/retirement, foreign actor/tenant
denial, safe projection and pooled tenant-context clearing. TypeScript and targeted
ESLint pass with zero errors. Architecture verification passes.

Reproduce with the Attendance contract/domain Vitest command from
[policy/holiday validation](HCM-3-POLICY-HOLIDAY-VALIDATION.md), and the
`attendance-configuration.database.spec.ts` command from
[configuration storage validation](HCM-3-CONFIGURATION-STORAGE-VALIDATION.md).

This slice does not publish development defaults or provide roster, preview,
HTTP or UI behavior. Dated workday resolution and source commands are subsequent
requirements; this evidence does not mark any business app complete.
