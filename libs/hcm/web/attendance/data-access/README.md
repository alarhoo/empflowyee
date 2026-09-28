# Attendance browser data access

Typed HTTP clients for attendance-owned APIs. `ScheduleTemplatesApi` uses the
universal Attendance contracts, server-owned pagination and caller-retained
idempotency keys. It never supplies browser business fixtures or persisted rows.

Template reads and commands require current API authorization. An ambiguous
write response preserves the form and original key for recovery.
