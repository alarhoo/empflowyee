# HCM-3 finalized design review

Status: Step-1 design finalized, 2026-09-28; executable readiness results are in
the [validation record](../testing/HCM-3-PREPARATION-VALIDATION.md). Design is not
implementation acceptance. No HCM-3 business code, migration, seed, Nx project,
worker executable or cloud resource was created. Runtime catalogue regeneration
only synchronizes the reviewed metadata.

## PACKAGE

- [Product decisions](HCM-3-DECISIONS.md#decisions) and
  [approval provenance](HCM-3-DESIGN-APPROVAL.md): all current decisions resolved;
  001,002,009,017,018 remain visible later-capability warnings.
- [Exact routes/floorplans](HCM-3-APP-DESIGN-MAP.md) and owning app API tables.
- [Shared functional baseline](HCM-3-FUNCTIONAL-BASELINE.md),
  [shared technical design](../architecture/TDD-HCM-3-COMMON.md),
  [SQL/integration design](../architecture/TDD-HCM-3-DATA-MODEL.md).
- Owning [Leave](../domains/leave/TECHNICAL-DESIGN.md),
  [Attendance](../domains/attendance/TECHNICAL-DESIGN.md) and
  [Workflow](../domains/workflow/TECHNICAL-DESIGN.md) technical designs.
- [Accepted worker ADR](../adr/ADR-HCM-BACKGROUND-WORK.md): one shared thin
  composition, PostgreSQL durable intent/outbox/lease/idempotency, finite drain
  or local polling. No API scheduler. Future GCP Job/Scheduler needs IaC/IAM review.

## REVIEW

Technical review reconciled the actual workforce, access, documents, notifications,
audit and runtime ports against the logical domain inputs. Opaque text IDs and
tenant composite keys remain; no parallel workforce or access stores. Exact time
uses milliseconds plus rational minute evidence; leave posting uses decimal
units with published per-day rounding. Source slots/decisions and ledger remain
authoritative; Workflow only dispatches and reconciles source proof.

Reviewed corrections include inactive-unless-configured minimum rest, no new
step-up requirement, no missing-punch auto-close, online-only capture, disabled
unconfigured overtime, Unpaid LOP with no account/reservation, and encashment
configuration/unavailable state without submission/payment/handoff. Source
candidate reassignment cannot create authority. Disabled future logical entities
are explicitly excluded from physical implementation.

Installed native evidence fixes status to Fundamental Core ObjectStatusComponent;
FCL has native-backed pages per column, with maintained HcmDynamicPage/ObjectPage
compositions. Calendars use native date selection plus a textual agenda; no custom
resource scheduler, CSS, Storybook or Theme Lab is admitted. Native interaction,
responsive and accessibility checks are planned implementation obligations.

Each of 23 app packages has FDD, TDD, decisions, traceability, BLUEPRINT and
APPROVALS. The 144 stable FDD requirements map to explicit design and planned
test IDs. Hashes record Codex's delegated technical finalization under the actual
product-owner instruction; they do not invent a separate human or independent
review of newly written bytes. Historical HCM-0 evidence remains historical.

## READINESS

The final machine-readable per-app results and checked evidence hashes are in
[readiness evidence](../testing/HCM-3-PREPARATION-READINESS.json). The table records
the executable gate result, updated only after successful checks.

| App                       | Readiness | Reviewed package                                                                                            |
| ------------------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `APPLY_LEAVE`             | READY     | [TDD](../apps/apply-leave/TDD.md) · [Blueprint](../apps/apply-leave/BLUEPRINT.json)                         |
| `APPROVE_ATTENDANCE`      | READY     | [TDD](../apps/approve-attendance/TDD.md) · [Blueprint](../apps/approve-attendance/BLUEPRINT.json)           |
| `APPROVE_LEAVES`          | READY     | [TDD](../apps/approve-leaves/TDD.md) · [Blueprint](../apps/approve-leaves/BLUEPRINT.json)                   |
| `ATTENDANCE_CORRECTIONS`  | READY     | [TDD](../apps/attendance-corrections/TDD.md) · [Blueprint](../apps/attendance-corrections/BLUEPRINT.json)   |
| `ATTENDANCE_MANAGEMENT`   | READY     | [TDD](../apps/attendance-management/TDD.md) · [Blueprint](../apps/attendance-management/BLUEPRINT.json)     |
| `COMP_OFF_ADMINISTRATION` | READY     | [TDD](../apps/comp-off-administration/TDD.md) · [Blueprint](../apps/comp-off-administration/BLUEPRINT.json) |
| `COMP_OFF_ENCASHMENT`     | READY     | [TDD](../apps/comp-off-encashment/TDD.md) · [Blueprint](../apps/comp-off-encashment/BLUEPRINT.json)         |
| `HOLIDAY_CALENDARS`       | READY     | [TDD](../apps/holiday-calendars/TDD.md) · [Blueprint](../apps/holiday-calendars/BLUEPRINT.json)             |
| `LEAVE_ADMINISTRATION`    | READY     | [TDD](../apps/leave-administration/TDD.md) · [Blueprint](../apps/leave-administration/BLUEPRINT.json)       |
| `LEAVE_BALANCE`           | READY     | [TDD](../apps/leave-balance/TDD.md) · [Blueprint](../apps/leave-balance/BLUEPRINT.json)                     |
| `LEAVE_ENCASHMENT`        | READY     | [TDD](../apps/leave-encashment/TDD.md) · [Blueprint](../apps/leave-encashment/BLUEPRINT.json)               |
| `LEAVE_POLICIES`          | READY     | [TDD](../apps/leave-policies/TDD.md) · [Blueprint](../apps/leave-policies/BLUEPRINT.json)                   |
| `MY_APPROVALS`            | READY     | [TDD](../apps/my-approvals/TDD.md) · [Blueprint](../apps/my-approvals/BLUEPRINT.json)                       |
| `MY_ATTENDANCE`           | READY     | [TDD](../apps/my-attendance/TDD.md) · [Blueprint](../apps/my-attendance/BLUEPRINT.json)                     |
| `MY_SCHEDULE`             | READY     | [TDD](../apps/my-schedule/TDD.md) · [Blueprint](../apps/my-schedule/BLUEPRINT.json)                         |
| `MY_TASKS`                | READY     | [TDD](../apps/my-tasks/TDD.md) · [Blueprint](../apps/my-tasks/BLUEPRINT.json)                               |
| `SHIFT_PLANNING`          | READY     | [TDD](../apps/shift-planning/TDD.md) · [Blueprint](../apps/shift-planning/BLUEPRINT.json)                   |
| `TEAM_ATTENDANCE`         | READY     | [TDD](../apps/team-attendance/TDD.md) · [Blueprint](../apps/team-attendance/BLUEPRINT.json)                 |
| `TEAM_CALENDAR`           | READY     | [TDD](../apps/team-calendar/TDD.md) · [Blueprint](../apps/team-calendar/BLUEPRINT.json)                     |
| `WORKFLOW_DEFINITIONS`    | READY     | [TDD](../apps/workflow-definitions/TDD.md) · [Blueprint](../apps/workflow-definitions/BLUEPRINT.json)       |
| `WORKFLOW_OPERATIONS`     | READY     | [TDD](../apps/workflow-operations/TDD.md) · [Blueprint](../apps/workflow-operations/BLUEPRINT.json)         |
| `WORK_SCHEDULES`          | READY     | [TDD](../apps/work-schedules/TDD.md) · [Blueprint](../apps/work-schedules/BLUEPRINT.json)                   |
| `WORK_SCHEDULE_TEMPLATES` | READY     | [TDD](../apps/work-schedule-templates/TDD.md) · [Blueprint](../apps/work-schedule-templates/BLUEPRINT.json) |

## DELIVERY

[Foundation reconciliation and ordered migration/app plan](HCM-3-FOUNDATION-DESIGN.md#order)
specify foundation-before-consumer delivery. Extend current Access/Runtime/Audit,
Documents and Notifications, then background mechanics, Attendance configuration/
workdays, Leave policies/ledger, source cases, requests/evidence/periods, comp-off
and Workflow integration. Foundation API contracts can be developed before final
UI order. Generate real libraries only for the slice being implemented.

Use granular `codex/hcm-3-<foundation-or-app>` branches and each TDD's coherent
contract/domain, persistence/API, native UI and acceptance/docs commit plan.
Main changes only through PRs; no giant wave implementation branch or deployment.
Readiness admits design inputs; each later implementation slice still requires
real PostgreSQL negative tests, acceptance and reviewed operational evidence.
