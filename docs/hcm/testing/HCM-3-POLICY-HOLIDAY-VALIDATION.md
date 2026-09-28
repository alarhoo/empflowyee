# HCM-3 policy and holiday contract validation

Verified locally on 2026-09-28. Runtime-universal parsers now cover Attendance
policy and holiday drafts; the server domain resolves published holiday intervals.
This is foundation evidence, not acceptance of a completed business app.

The eight new tests cover dependent rounding/rest fields, disabled overtime,
explicit qualification/cap/preapproval, independent manager selection, typed
candidate selectors and contiguous stages; explicit observed dates, region/location
intersection, exact partial time, higher-priority interval splitting, equal-priority
collision rejection, DST gaps/overlaps and a 23-hour civil day. All 22 Attendance
contract/domain tests pass. Targeted TypeScript and ESLint pass without errors.

Run `pnpm exec vitest run --config tools/milestones/hcm-3/vitest.config.mts
libs/hcm/contracts/attendance libs/hcm/api/attendance/domain`.

Technical review under the existing product-owner delegation checked the owning
Attendance TDD's configuration representation against DEC-HCM3-004/006/007/008
and the logical AttendanceApprovalRule selectors. Explicit endpoint choices reuse
the already approved DST behavior; candidate selectors confer no authority.
The refinement introduces no new business approval, statutory default, capture
channel, payroll consumer or human review claim. Only affected DOMAIN approval
fingerprints are refreshed for the reviewed representation.

Persistence, current candidate resolution/authorization, publication preview,
commands, worker handlers and screens remain separate delivery requirements.
