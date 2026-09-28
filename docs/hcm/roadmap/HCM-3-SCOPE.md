# HCM-3 — Scope

HCM-3 delivers governed leave, time/schedule/attendance, and consolidated task/approval coordination on top of the current workforce, access-control, notification, document and audit foundations.

## Application inventory

### Leave

- `APPLY_LEAVE`
- `LEAVE_BALANCE`
- `COMP_OFF_ENCASHMENT`
- `TEAM_CALENDAR`
- `APPROVE_LEAVES`
- `LEAVE_ADMINISTRATION`
- `COMP_OFF_ADMINISTRATION`
- `LEAVE_ENCASHMENT`
- `LEAVE_POLICIES`

### Attendance & Work Schedule

- `MY_ATTENDANCE`
- `MY_SCHEDULE`
- `ATTENDANCE_CORRECTIONS`
- `TEAM_ATTENDANCE`
- `APPROVE_ATTENDANCE`
- `SHIFT_PLANNING`
- `ATTENDANCE_MANAGEMENT`
- `WORK_SCHEDULES`
- `HOLIDAY_CALENDARS`
- `WORK_SCHEDULE_TEMPLATES`

### Workflow & Approvals

- `MY_TASKS`
- `MY_APPROVALS`
- `WORKFLOW_DEFINITIONS`
- `WORKFLOW_OPERATIONS`

## Domain ownership

- **Leave** owns leave policy/enrollment, ledger/balance/reservations, leave-domain requests/decisions, comp-off credit and leave-unit encashment handoff evidence.
- **Attendance & Work Schedule** owns shifts/schedules/holiday calendars, resolved workdays, attendance event evidence/calculation/corrections, period locking and non-monetary work evidence.
- **Workflow & Approvals** owns reusable coordination/task definitions, task/candidate/assignment mirrors, action dispatch/receipt, timers and reconciliation. It does **not** own source-domain business decisions.

## App-boundary rule

`APPROVE_LEAVES` and `APPROVE_ATTENDANCE` remain domain-specific approval experiences. `MY_APPROVALS` is the consolidated cross-domain actionable inbox. Workflow dispatches a source action; Leave/Attendance re-authorize and own the accepted business decision.

## Implementation prerequisites

- Workforce Foundation/Employee/Job Architecture current as-of Employment/Assignment/Reporting/Location data.
- Access Control current permissions/scopes and development personas.
- HCM-1 Notifications, Documents and Audit capabilities.
- Current SQL-first/Kysely/RLS database foundation.

## Readiness rule

Claude prepares all HCM-3 FDD/TDDs first. Implementation starts only when the relevant app readiness gates pass and every `BLOCKS_THIS_APP` decision is resolved. Non-blocking production concerns move to carry-forward rather than stopping local/current delivery.
