# hcm-api-attendance-infrastructure

Attendance persistence adapters consume caller-owned tenant transactions. The
schedule reader projects the declared DTO from SQL; it does not create authority,
serialize database entities, migrate at startup or own an HTTP scheduler.

Schedule storage is defined by forward migration `000037_attendance_schedules.sql`.
Run its real PostgreSQL tests with `pnpm exec vitest run --config tools/hcm-database/vitest.config.mts
libs/hcm/api/attendance/infrastructure/src/lib/attendance-schedules.database.spec.ts`.
The [owning TDD](../../../../../docs/hcm/domains/attendance/TECHNICAL-DESIGN.md)
and source command layer define publication authorization and impact checks.
