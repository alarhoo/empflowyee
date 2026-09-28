# hcm-api-attendance-domain

Pure Attendance calculations for approved HCM-3 behavior: exact interval
normalization/subtraction, dated schedule resolution and configured minimum rest.
No HTTP, SQL or browser implementation imports. Temporal is scoped to this server
domain; gaps and missing overlap choices produce explicit resolution errors.

Run focused tests with `pnpm exec vitest run --config tools/milestones/hcm-3/vitest.config.mts`.
See [the owning TDD](../../../../../docs/hcm/domains/attendance/TECHNICAL-DESIGN.md).
