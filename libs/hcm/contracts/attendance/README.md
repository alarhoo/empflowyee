# hcm-attendance-contract

Runtime-universal Attendance DTOs and pure request validation shared by browser
forms and Nest transport. This library contains no persistence rows, timezone
calculation implementation or business authority. Input values are validated
without silent trimming, rounding or ownership overrides.

Run focused tests with `pnpm exec vitest run --config tools/milestones/hcm-3/vitest.config.mts`.
See [the owning TDD](../../../../docs/hcm/domains/attendance/TECHNICAL-DESIGN.md).
