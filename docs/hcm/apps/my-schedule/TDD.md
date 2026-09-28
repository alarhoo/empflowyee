# My Schedule — technical design

Status: approved technical design, 2026-09-28, following the approved [FDD](FDD.md)
and [product-owner delegation](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation
is planned. The owning [attendance TDD](../../domains/attendance/TECHNICAL-DESIGN.md),
[shared TDD](../../architecture/TDD-HCM-3-COMMON.md) and
[SQL/integration TDD](../../architecture/TDD-HCM-3-DATA-MODEL.md) are normative parts
of this design; the blueprint binds their exact reviewed revisions.

## ROUTE

App `MY_SCHEDULE`, owner `attendance`, route `/attendance/my-schedule`. Child routes: base list.
Route IDs are opaque resource IDs (dayId for attendance day, taskId for inbox,
caseId for approval, configuration rootId plus version query for configuration).
Where no single-resource GET is listed, selected detail reloads the collection
with exact `id` filter and requires exactly one authorized row; otherwise 404.
The feature lazy loads from `libs/hcm/web/attendance/feature-my-schedule`. Discovery permission
`hcm.catalogue.MY_SCHEDULE.discover` reveals navigation only; every API uses
business authorization. Unavailable dependencies render an honest state.

## FLOORPLAN

`UX-FP-DYNAMIC-PAGE` / `COMPOSED`. Native Calendar/DatePicker selection plus server-owned textual agenda inside HcmDynamicPage; a date is not a resource scheduling grid.
No custom CSS or theme logic. Detail title uses Close and Maximize/Minimize; native
responsive layout shows one active column on narrow screens and restores list
focus on close. Important data: Date, zone, workday classification, intervals, planned minutes, published revision and change reference.
Semantic fields use ObjectStatus for state, DatePicker/TimePicker for local time,
DateTimePicker for corrected instants, Select/ComboBox for authorized IDs/enums,
TextArea for reasons and FileUploader for governed evidence. Numeric unit/time
formatters preserve decimal/exact values with explicit units and timezone labels.
This app is read-only; it creates no hidden mutation commands or editable status cells.
Table ownership is server-side. Allowlisted sort keys: `workDate, state, id`; fields absent
from a resource DTO are rejected for that resource. Filter IDs, state and bounded
date range only. Calendar filters use from/to and authorized employment; configuration
lists use code/name/state. The common cursor contract binds all query parameters.

## NATIVE

Installed capability evidence is [COMMON UX](../../architecture/TDD-HCM-3-COMMON.md#ux).
Use `@fundamental-ngx/ui5-webcomponents` 0.64.3: DatePicker, TimePicker,
DateTimePicker, Select, ComboBox, TextArea, FileUploader, Table,
Form and FormItem through their maintained subpath exports; Calendar for agenda.
Semantic status uses `ObjectStatusComponent` from `@fundamental-ngx/core/object-status`
0.64.3, as verified in the current My Profile implementation.
Use `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 FlexibleColumnLayout for FCL.
The repository HcmDynamicPage/HcmObjectPage/HcmViewSettings preserve native slots,
events and accessibility. Platform table and Core calendar APIs were evaluated;
no resource-lane/drag scheduler is claimed. Runtime keyboard, responsive and screen-
reader acceptance remains required in the production app.

## API

Exact routes below are the admitted endpoint set for this app. Query means the
shared bounded cursor/filter contract plus required employment selector for self
views and from/to for calendar/time ranges. Idempotency, expected revisions,
statuses and errors follow [COMMON CONTRACTS](../../architecture/TDD-HCM-3-COMMON.md#contracts).
Business DTO fields are defined in [DOMAIN SCHEMAS](../../domains/attendance/TECHNICAL-DESIGN.md#schemas)
and its supplements. Read representations of Draft DTOs add id/revision/state;
PATCH is whole-draft replacement, not an arbitrary JSON patch. Lists are envelope
`{items,nextCursor,total?}`, with scope-filtered total only. `CommandResult`
contains id/revision/state and async operationId/statusUrl when applicable.

| Method | Exact route                                 | Request schema | Response schema | Business permission               |
| ------ | ------------------------------------------- | -------------- | --------------- | --------------------------------- |
| GET    | `/api/v1/attendance/me/schedule`            | Query          | WorkdayView[]   | `hcm.attendance.my-schedule.read` |
| GET    | `/api/v1/attendance/me/schedule/{workDate}` | Query          | WorkdayView     | `hcm.attendance.my-schedule.read` |

Every response has a purpose-built projection; private narrative/evidence requires
additional current field permission. No persistence row serialization. Disabled
encashment/device/pool/delegation/payment routes are absent, not successful stubs.

## AUTHORIZATION

Entitlement `hcm.attendance` and each endpoint's explicit
operation permission are both required. Logical access functions
`WORK_SCHEDULE_SELF_READ` map to the enumerated operation grants,
never a role-name bypass. Seed only the relevant actions for the actor described
by the FDD: Employee with a verified own employment. Scope is own verified employment. Publish/decide/recover/lock/reopen/on-behalf
are distinct operation grants where listed. A read grant cannot imply them.
Workflow additionally checks source module entitlement and source decision grant
on every row/action. No combining partial scope grants, trusting UI visibility,
or relying on assignment/reporting as permission. Fresh session and source/task/
subject revisions are rechecked in the transaction; reasons and audit are retained.
Independent source slots cannot be satisfied by maker/beneficiary. No step-up
infrastructure or delegation creation is required/introduced in this release.

## DATA

Owning tables/read projections: published_workday, published_work_segment (scoped read projection).
Use physical names and admitted table exclusions in
[SQL TABLES](../../architecture/TDD-HCM-3-DATA-MODEL.md#tables), plus the owning
logical catalogue mapping.
SQL-first ordered migrations create constraints/indexes/RLS/grants together;
Kysely types are generated from SQL, repositories map rows to DTOs. Tenant composite
keys and RLS apply to every business row. Published versions/evidence/decisions/
ledger are immutable. Read projections filter scope before count/page/search.
No frontend fixture arrays or duplicate workforce/access/document stores.

## CONSISTENCY

Use owning domain algorithms, account/case/period locks and same-key receipts.
Previews bind source/input/config revisions and are consumed only after revalidation.
Material changes invalidate old approval generation and demand new review. All
domain effects, audit, receipt and outbox commit together; async completion is
shown separately. Source Leave/Attendance alone decides business cases; Workflow
coordinates and reconciles receipts. Unknown delivery stays unknown and is queried
by original key, never resent as a new decision. Read-only queries do not schedule business mutations.
Background dependencies: published workday resolver.
Use the [accepted worker](../../adr/ADR-HCM-BACKGROUND-WORK.md) and current
owner contracts; no API scheduling loop. Notifications are safe inbox intents
after commit. Recovery rechecks current authority and cannot fabricate source truth.

## PROJECTS

Planned projects, generated only when this slice needs them (reuse shared domain
projects once created). Dependency direction is feature → data-access/contract/UX;
transport → application/contract; application → domain/ports; infrastructure
implements ports; module/root composes. Cross-domain calls use owner ports and
universal DTOs; browser never imports backend implementation. Worker is a separate
approved foundation composition, not a project hidden in this business blueprint.

| Project                                  | Root                                          | Tags                                                                     |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `hcm-attendance-contract`                | `libs/hcm/contracts/attendance`               | `product:hcm`, `runtime:universal`, `domain:attendance`, `type:contract` |
| `hcm-web-attendance-data-access`         | `libs/hcm/web/attendance/data-access`         | `product:hcm`, `runtime:web`, `domain:attendance`, `type:data-access`    |
| `hcm-web-attendance-feature-my-schedule` | `libs/hcm/web/attendance/feature-my-schedule` | `product:hcm`, `runtime:web`, `domain:attendance`, `type:feature`        |
| `hcm-api-attendance-domain`              | `libs/hcm/api/attendance/domain`              | `product:hcm`, `runtime:api`, `domain:attendance`, `type:domain`         |
| `hcm-api-attendance-application`         | `libs/hcm/api/attendance/application`         | `product:hcm`, `runtime:api`, `domain:attendance`, `type:application`    |
| `hcm-api-attendance-infrastructure`      | `libs/hcm/api/attendance/infrastructure`      | `product:hcm`, `runtime:api`, `domain:attendance`, `type:infrastructure` |
| `hcm-api-attendance-transport`           | `libs/hcm/api/attendance/transport`           | `product:hcm`, `runtime:api`, `domain:attendance`, `type:transport`      |
| `hcm-api-attendance-module`              | `libs/hcm/api/attendance/module`              | `product:hcm`, `runtime:api`, `domain:attendance`, `type:module`         |

## VERIFICATION

All test IDs in [traceability](TRACEABILITY.md) are planned acceptance cases, not
executed-test claims. Use real PostgreSQL/HTTP for tenant/concurrency/receipt
invariants, contract tests for DTO projections and pure unit tests for algorithms.
Production-app browser checks cover keyboard, narrow/desktop layout, native action
behavior, focus, validation, empty/error/retry and stale response clearing. Include
the owning domain's boundary suite. Design/readiness checks alone do not approve
the implemented app or floorplan.

## DESIGN-001

Requirement [REQ-MY-SCHEDULE-001](FDD.md#req-my-schedule-001). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Foreign employment selection is hidden; missing/conflicted input appears unavailable rather than a fabricated default.

## DESIGN-002

Requirement [REQ-MY-SCHEDULE-002](FDD.md#req-my-schedule-002). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Cross-midnight and offset changes display the actual intervals without shifting a calendar date by the viewer’s timezone.

## DESIGN-003

Requirement [REQ-MY-SCHEDULE-003](FDD.md#req-my-schedule-003). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: A superseded workday is labelled as history and never displayed as the current plan; no schedule write action is exposed.

## DESIGN-004

Requirement [REQ-MY-SCHEDULE-004](FDD.md#req-my-schedule-004). Apply every API permission and exact current scope before row lookup/count or mutation. Exercise tenant and grant revocation in real SQL transactions, including a second own employment.
Acceptance target: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

## DESIGN-005

Requirement [REQ-MY-SCHEDULE-005](FDD.md#req-my-schedule-005). Use the selected native floorplan and semantic controls, cancel stale queries on context change and keep explicit error/empty/unavailable states. Verify focus and keyboard after every action.
Acceptance target: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

## DESIGN-006

Requirement [REQ-MY-SCHEDULE-006](FDD.md#req-my-schedule-006). Enforce the DATA and CONSISTENCY transaction boundaries; inject failure before/after commit and replay the same key. Read-only surfaces expose no write route.
Acceptance target: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## DELIVERY

Branch `codex/hcm-3-my-schedule`. Prerequisite foundations must be merged before app
delivery; follow the [ordered foundation plan](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#order).
Planned coherent commits:

1. `feat(hcm-attendance): add my-schedule contracts and domain behavior`
2. `feat(hcm-attendance): persist my-schedule with authorization and receipts`
3. `feat(hcm-attendance): add my-schedule native application experience`
4. `test(hcm-attendance): verify my-schedule acceptance and document evidence`

Omit persistence mutations for read-only slices; reuse admitted domain foundation
work rather than duplicate tables. PR CI never deploys. No implementation occurs
as part of this Step-1 design package.
