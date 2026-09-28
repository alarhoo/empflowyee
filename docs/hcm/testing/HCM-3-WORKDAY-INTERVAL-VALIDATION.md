# HCM-3 dated configuration and workday interval validation

Verified locally on 2026-09-28. Assignment commands now require exactly one typed
scope, real effective dates, bounded preserved reasons and a valid optional
revision. The domain applies Employment > Assignment > Location > Department >
OrgUnit > LegalEntity > Tenant to one employment's dated facts, rejecting ties at
the selected precedence. Missing configuration remains explicitly unavailable.

The Kysely assignment reader selects only published, covering, tenant-owned
configuration matching the supplied authoritative Workforce scope. It returns
all matching candidates for conflict detection, not an arbitrary first row.
Current permission and source-input locking remain the consuming use case's work.

Dated interval composition retains original scheduled work and unpaid breaks,
and separately computes work intervals excluding explicit holidays. The scheduled
denominator is preserved for Leave's policy conversion. Cross-midnight work also
evaluates holidays on the following civil date without changing its start work
date. Declared weekly rest stays distinguishable from failed resolution.

All 31 Attendance contract/domain tests pass. Seven new cases cover scope command
validation, all seven precedence levels, equal-precedence conflicts, date endpoints,
concurrent employment isolation, partial holiday/break overlap, year rollover and
rest-day context validation. All ten configuration database tests pass, including
the new server-filtered assignment projection test (publication, date, employment,
foreign tenant and absent pool context).

Use the contract/domain command in [policy/holiday validation](HCM-3-POLICY-HOLIDAY-VALIDATION.md)
and the configuration PostgreSQL command in [storage validation](HCM-3-CONFIGURATION-STORAGE-VALIDATION.md).
This is interval/selection foundation evidence. Durable published workdays,
override/roster integration, source command and worker composition, HTTP and UI
are not yet implemented by this slice.
