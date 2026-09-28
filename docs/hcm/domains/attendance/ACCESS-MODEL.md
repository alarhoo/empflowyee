# Attendance & Work Schedule — Application Functions

Every operation requires authenticated tenant/principal context, the required entitlement and permission, and independently resolved row scope. Role names are seed/navigation guidance only; backend authorization is authoritative.

| App                     | Function                      | Purpose                                                         | Default scope/discovery                         |
| ----------------------- | ----------------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| MY_ATTENDANCE           | ATTENDANCE_SELF_MANAGE        | View own status/history and clock through an allowed channel    | Exact self employment / Employee                |
| MY_SCHEDULE             | WORK_SCHEDULE_SELF_READ       | View own resolved published schedule                            | Exact self employment / Employee                |
| ATTENDANCE_CORRECTIONS  | ATTENDANCE_CORRECTION_SELF    | Preview, submit, track and withdraw own correction              | Exact self employment/day / Employee            |
| TEAM_ATTENDANCE         | ATTENDANCE_TEAM_VIEW          | View privacy-safe current scoped team attendance                | Current scoped reportees / Manager              |
| APPROVE_ATTENDANCE      | ATTENDANCE_APPROVAL_ACT       | Read and decide exact current Attendance cases                  | Exact approval slot + current scope / Approver  |
| SHIFT_PLANNING          | SHIFT_ROSTER_MANAGE           | Draft, validate, publish and supersede team rosters             | Assigned planning scope / Manager or planner    |
| ATTENDANCE_MANAGEMENT   | ATTENDANCE_OPERATIONS_MANAGE  | Operate events, calculations, corrections, periods and handoffs | Assigned time scope / Time administrator        |
| WORK_SCHEDULES          | WORK_SCHEDULE_MANAGE          | Configure shifts, schedules, policies, assignment and overrides | Organization/time policy scope                  |
| HOLIDAY_CALENDARS       | HOLIDAY_CALENDAR_MANAGE       | Configure, publish and assign holiday calendars                 | Organization/location policy scope              |
| WORK_SCHEDULE_TEMPLATES | WORK_SCHEDULE_TEMPLATE_MANAGE | Curate reusable draft-seeding patterns                          | Tenant/organization / Time policy administrator |

## Access invariants

- Self, manager relationship, task assignment, calendar membership, planner membership or administrator title never substitute for an explicit permission and current scope.
- Routing/discovery is not authorization. Decision/action endpoints recheck current authority and subject state.
- Cross-tenant correlation is forbidden; tenant context is server-established and RLS-enforced.
- Sensitive projections are purpose-built and minimum-data; broad source objects are not copied into queues/calendars/notifications.
- Assignment/reporting relationships may help discover candidates but never grant permission on their own.

## HCM3-SCOPE

The [approved HCM-3 resolutions](../../roadmap/HCM-3-DECISIONS.md#decisions)
and [owning technical design](TECHNICAL-DESIGN.md) define the admitted release.
Minimum rest is inactive unless tenant policy configures it. Existing authenticated
sessions plus current permissions/scopes, reason capture and audit satisfy
current action assurance; no step-up infrastructure is required. Offline/device
capture, pooling, delegation creation and external monetary handoffs are not
activated by enum values present in this logical model.
