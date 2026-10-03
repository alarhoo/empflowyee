# HCM-3 implementation status

Step-2 implementation is in progress. [Step-1 readiness](HCM-3-DESIGN-REVIEW.md)
admitted all 23 designs; readiness does not mean the applications are implemented.
The product owner resolved [DEC-HCM3-024](../testing/HCM-3-HOLIDAY-PUBLICATION-QUESTION.md):
Holiday publication requires explicit employment/timezone context.
The Holiday Calendars native UI is now locally accepted.

## Foundations

Workforce's read-only time-context prerequisite is implemented and verified;
see [projection validation](../testing/HCM-3-WORKFORCE-TIME-VALIDATION.md).
Its bounded dated impact-subject port is verified in
[subject paging validation](../testing/HCM-3-TIME-SUBJECTS-VALIDATION.md).

Attendance's schedule contract and exact-time calculation slice is implemented;
see [time validation](../testing/HCM-3-ATTENDANCE-TIME-VALIDATION.md).
Schedule storage and the version reader are also verified in
[storage validation](../testing/HCM-3-SCHEDULE-STORAGE-VALIDATION.md).
Policy/holiday contracts and holiday interval resolution are verified in
[configuration validation](../testing/HCM-3-POLICY-HOLIDAY-VALIDATION.md).
Policy/holiday storage and DTO projections are verified in
[configuration storage validation](../testing/HCM-3-CONFIGURATION-STORAGE-VALIDATION.md).
Reusable shifts and their persistence/projection are verified in
[shift validation](../testing/HCM-3-SHIFT-VALIDATION.md).
Dated configuration selection and exact workday interval composition are verified
in [workday interval validation](../testing/HCM-3-WORKDAY-INTERVAL-VALIDATION.md).
Schedule/template Draft commands and immutable command/preview evidence are
verified in [command validation](../testing/HCM-3-CONFIGURATION-COMMAND-VALIDATION.md).
The reusable template preview/publish/retire application flow is verified in
[publication validation](../testing/HCM-3-TEMPLATE-PUBLICATION-VALIDATION.md).
The template HTTP API and authenticated pagination are verified in
[API validation](../testing/HCM-3-TEMPLATE-API-VALIDATION.md).
Canonical template grants and incomplete draft defaults are verified in
[seed validation](../testing/HCM-3-SEED-DEFAULTS-VALIDATION.md).
Holiday calendar Draft creation/replacement/successor commands are verified in
[holiday command validation](../testing/HCM-3-HOLIDAY-COMMAND-VALIDATION.md).
The five holiday draft/read HTTP routes and migration 43 cursor extension are
verified in [holiday API validation](../testing/HCM-3-HOLIDAY-API-VALIDATION.md).
Holiday publication now has real durable previews, publication and retirement,
with migration 47 preserving explicit context. See the current
[publication validation](../testing/HCM-3-HOLIDAY-PUBLICATION-VALIDATION.md).
Dated assignments/supersession, durable workday production, normal launchpad
discovery and two browser journeys pass; unavailable prerequisites remain explicit.
Dated Workforce/configuration input composition is verified in
[input validation](../testing/HCM-3-CONFIGURATION-INPUT-VALIDATION.md).
Migration 44 monthly periods, immutable lock bases and publication fences are
verified in [period fence validation](../testing/HCM-3-PERIOD-FENCE-VALIDATION.md).
Migration 45 immutable scheduled workdays and exact interval evidence are verified
in [workday storage validation](../testing/HCM-3-WORKDAY-STORAGE-VALIDATION.md).
The assigned resolver applies DEC-HCM3-022/023 and retains dated source evidence;
see [assigned resolver validation](../testing/HCM-3-ASSIGNED-RESOLVER-VALIDATION.md).
Migration 46 and the real AttendanceResolve worker atomically publish workdays or
explicit unavailable outcomes; see [worker validation](../testing/HCM-3-RESOLVE-WORKER-VALIDATION.md).
Remaining configuration producers/APIs/seeds, other domain handlers and the other
app UIs remain pending.

Work Schedules implementation now includes native schedule/shift/policy editors,
dated publication, reviewed schedule/policy assignments, stored-workday inspection
and typed roster/override resolution. Override Draft/read/preview commands now
retain encrypted reasons and exact reviewed workday bases; independent approval
evaluation and required case/slot/decision storage have focused tests; production
source decisions remain pending. Required-approval Override submission now creates
its case, slots and real Workflow intake atomically and returns safe reload progress.
The routed override editor reuses native interval fields for Draft/review/submission;
it has form and compile checks but no complete-app browser acceptance. Internal
[Workflow intake and initial DomainManifest planning](../testing/HCM-3-WORKFLOW-INTEGRATION.md)
now have real leased-worker/PostgreSQL tests with Attendance source adapters; dispatch, timers and
receipt reconciliation still require delivery. See the Work Schedules
[integration record](../testing/HCM-3-WORK-SCHEDULES-INTEGRATION.md) for executed
tests and remaining command, approval, Leave-impact and browser work. It has not
passed complete-app acceptance and its tile remains unavailable. After a verified
backup, local PostgreSQL has migrations through 64, Attendance seed version 4 and
Leave access seed version 1. The original field-encryption key was preserved.
The rebuilt API is ready and the worker runs AttendanceResolve and WorkflowPlan;
source decisions and the remaining Workflow lanes are still unavailable.

Leave now has exact quantities, typed policy persistence and authenticated draft,
version, list, type-option and dated enrollment APIs, verified against disposable
PostgreSQL/HTTP. Balance enrollment creates an empty account; Unpaid creates none.
Internal grant ledger, accrual quantity and current Workforce/Attendance source
ports are tested prerequisites, not complete entitlement or request journeys.
Full/resolved Hourly quantities now consume current published workday intervals,
with exact per-row totals, period/version bounds and source fingerprints; half-day
rounding and full request admission remain pending. Calculated self Draft create/read
APIs now persist encrypted evidence and immutable day/interval rows with current
scope and source checks. Unpaid records units without an account. Migration 65 and
Leave access seed 2 are verified only in disposable PostgreSQL so far. These APIs
do not expose a Leave preview or submit UI.
See the [Leave prerequisite record](../testing/HCM-3-LEAVE-FOUNDATION.md).
This does not complete a Leave app or milestone; publication, entitlement funding,
source journeys and the native UIs remain pending. Local PostgreSQL remains at
migration 64; liveness/readiness and the tenant-host web entry point returned 200
after rebuilding and restarting the task-owned API and worker on 2026-10-03.

| Slice                                             | State                                     | Evidence                                                           |
| ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| Scoped access grants and decision-time checks     | Implemented                               | [Validation](../testing/HCM-3-ACCESS-FOUNDATION-VALIDATION.md)     |
| Verified workload context and audit attribution   | Implemented                               | [Validation](../testing/HCM-3-BACKGROUND-FOUNDATION-VALIDATION.md) |
| Evidence and notifications extensions             | Planned                                   | [Foundation order](HCM-3-FOUNDATION-DESIGN.md#order)               |
| Durable domain work mechanics                     | Implemented                               | [Validation](../testing/HCM-3-BACKGROUND-FOUNDATION-VALIDATION.md) |
| Shared worker runtime/root                        | Implemented; AttendanceResolve registered | [Runbook](../operations/WORKER.md)                                 |
| Attendance, Leave and Workflow domain foundations | Planned                                   | [Ordered plan](HCM-3-FOUNDATION-DESIGN.md#order)                   |

**Work Schedule Templates is Complete** under local acceptance; see its
[production-build browser evidence](../testing/HCM-3-TEMPLATE-UI-VALIDATION.md).
**Holiday Calendars is also Complete** under its linked local acceptance.
The other 21 business apps remain Planned. No requested delivery milestone is
complete until its remaining apps and end-to-end journey pass.
Update this record and the canonical
app statuses only after their corresponding acceptance is verified.
Granular branches inherit prerequisite commits; main changes require PRs. Local
implementation commits do not deploy or provision cloud resources.
