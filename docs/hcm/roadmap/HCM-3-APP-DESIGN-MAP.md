# HCM-3 approved app design map

Status: finalized design, 2026-09-28. Routes and floorplans derive from reviewed
owning TDDs; implementation remains Planned. Every app consumes the common/domain
foundation designs. Runtime acceptance remains a later implementation obligation.

## MAP

| App                       | Exact route                           | Floorplan / mode              | Owning API and design                             |
| ------------------------- | ------------------------------------- | ----------------------------- | ------------------------------------------------- |
| `APPLY_LEAVE`             | `/leave/apply-leave`                  | UX-FP-FCL / NATIVE            | [TDD](../apps/apply-leave/TDD.md#api)             |
| `APPROVE_ATTENDANCE`      | `/attendance/approve-attendance`      | UX-FP-FCL / NATIVE            | [TDD](../apps/approve-attendance/TDD.md#api)      |
| `APPROVE_LEAVES`          | `/leave/approve-leaves`               | UX-FP-FCL / NATIVE            | [TDD](../apps/approve-leaves/TDD.md#api)          |
| `ATTENDANCE_CORRECTIONS`  | `/attendance/attendance-corrections`  | UX-FP-FCL / NATIVE            | [TDD](../apps/attendance-corrections/TDD.md#api)  |
| `ATTENDANCE_MANAGEMENT`   | `/attendance/attendance-management`   | UX-FP-FCL / NATIVE            | [TDD](../apps/attendance-management/TDD.md#api)   |
| `COMP_OFF_ADMINISTRATION` | `/leave/comp-off-administration`      | UX-FP-FCL / NATIVE            | [TDD](../apps/comp-off-administration/TDD.md#api) |
| `COMP_OFF_ENCASHMENT`     | `/leave/comp-off-encashment`          | UX-FP-FCL / NATIVE            | [TDD](../apps/comp-off-encashment/TDD.md#api)     |
| `HOLIDAY_CALENDARS`       | `/attendance/holiday-calendars`       | UX-FP-FCL / NATIVE            | [TDD](../apps/holiday-calendars/TDD.md#api)       |
| `LEAVE_ADMINISTRATION`    | `/leave/leave-administration`         | UX-FP-FCL / NATIVE            | [TDD](../apps/leave-administration/TDD.md#api)    |
| `LEAVE_BALANCE`           | `/leave/leave-balance`                | UX-FP-FCL / NATIVE            | [TDD](../apps/leave-balance/TDD.md#api)           |
| `LEAVE_ENCASHMENT`        | `/leave/leave-encashment`             | UX-FP-FCL / NATIVE            | [TDD](../apps/leave-encashment/TDD.md#api)        |
| `LEAVE_POLICIES`          | `/leave/leave-policies`               | UX-FP-FCL / NATIVE            | [TDD](../apps/leave-policies/TDD.md#api)          |
| `MY_APPROVALS`            | `/workflow/my-approvals`              | UX-FP-FCL / NATIVE            | [TDD](../apps/my-approvals/TDD.md#api)            |
| `MY_ATTENDANCE`           | `/attendance/my-attendance`           | UX-FP-FCL / NATIVE            | [TDD](../apps/my-attendance/TDD.md#api)           |
| `MY_SCHEDULE`             | `/attendance/my-schedule`             | UX-FP-DYNAMIC-PAGE / COMPOSED | [TDD](../apps/my-schedule/TDD.md#api)             |
| `MY_TASKS`                | `/workflow/my-tasks`                  | UX-FP-FCL / NATIVE            | [TDD](../apps/my-tasks/TDD.md#api)                |
| `SHIFT_PLANNING`          | `/attendance/shift-planning`          | UX-FP-FCL / NATIVE            | [TDD](../apps/shift-planning/TDD.md#api)          |
| `TEAM_ATTENDANCE`         | `/attendance/team-attendance`         | UX-FP-FCL / NATIVE            | [TDD](../apps/team-attendance/TDD.md#api)         |
| `TEAM_CALENDAR`           | `/leave/team-calendar`                | UX-FP-DYNAMIC-PAGE / COMPOSED | [TDD](../apps/team-calendar/TDD.md#api)           |
| `WORKFLOW_DEFINITIONS`    | `/workflow/workflow-definitions`      | UX-FP-FCL / NATIVE            | [TDD](../apps/workflow-definitions/TDD.md#api)    |
| `WORKFLOW_OPERATIONS`     | `/workflow/workflow-operations`       | UX-FP-FCL / NATIVE            | [TDD](../apps/workflow-operations/TDD.md#api)     |
| `WORK_SCHEDULES`          | `/attendance/work-schedules`          | UX-FP-FCL / NATIVE            | [TDD](../apps/work-schedules/TDD.md#api)          |
| `WORK_SCHEDULE_TEMPLATES` | `/attendance/work-schedule-templates` | UX-FP-FCL / NATIVE            | [TDD](../apps/work-schedule-templates/TDD.md#api) |
