# Work Schedule Templates — technical design

Status: approved technical design, 2026-09-28, following the approved [FDD](FDD.md)
and [product-owner delegation](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation
is planned. The owning [attendance TDD](../../domains/attendance/TECHNICAL-DESIGN.md),
[shared TDD](../../architecture/TDD-HCM-3-COMMON.md) and
[SQL/integration TDD](../../architecture/TDD-HCM-3-DATA-MODEL.md) are normative parts
of this design; the blueprint binds their exact reviewed revisions.

## ROUTE

App `WORK_SCHEDULE_TEMPLATES`, owner `attendance`, route `/attendance/work-schedule-templates`. Child routes: base list, `/:id` selected detail, `/new` draft create, `/:id/edit` draft edit.
Route IDs are opaque resource IDs (dayId for attendance day, taskId for inbox,
caseId for approval, configuration rootId plus version query for configuration).
Where no single-resource GET is listed, selected detail reloads the collection
with exact `id` filter and requires exactly one authorized row; otherwise 404.
The feature lazy loads from `libs/hcm/web/attendance/feature-work-schedule-templates`. Discovery permission
`hcm.catalogue.WORK_SCHEDULE_TEMPLATES.discover` reveals navigation only; every API uses
business authorization. Unavailable dependencies render an honest state.

## FLOORPLAN

`UX-FP-FCL` / `NATIVE`. Native FlexibleColumnLayout, HcmDynamicPage list in begin column and HcmObjectPage detail in middle; each column owns its page header. Complex create/edit stays on the dedicated draft route where declared; focused decision/reason uses a native Dialog.
No custom CSS or theme logic. Detail title uses Close and Maximize/Minimize; native
responsive layout shows one active column on narrow screens and restores list
focus on close. Important data: Code, name, status, day patterns, segments, timezone mode, revision and copy source.
Semantic fields use ObjectStatus for state, DatePicker/TimePicker for local time,
DateTimePicker for corrected instants, Select/ComboBox for authorized IDs/enums,
TextArea for reasons and FileUploader for governed evidence. Numeric unit/time
formatters preserve decimal/exact values with explicit units and timezone labels.
Signal Forms applies common and owning DTO validators on input and submit; published payloads are read-only. Source field errors remain attached to controls and summary.
Table ownership is server-side. Allowlisted sort keys: `code, name, state, id`; fields absent
from a resource DTO are rejected for that resource. Filter IDs, state and bounded
date range only. Calendar filters use from/to and authorized employment; configuration
lists use code/name/state. The common cursor contract binds all query parameters.

Template lists select the latest version of each root before filtering. `code`
and `name` are literal case-insensitive substring filters; `id` and `state` are
exact. Sort is `code|name|state|id` with optional `:asc|:desc`, default `code:asc`,
and same-direction root-ID tie-break. Duplicate/unknown parameters are rejected.
Detail accepts only optional `version`; all exact-version mutations require it.
Lists use the owning TDD's server-stored authenticated cursor and return no private
reason or storage-only fields. A source edit invalidates continuation; refresh
starts a new page sequence rather than mixing configuration revisions.

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

| Method | Exact route                                         | Request schema                   | Response schema | Business permission                             |
| ------ | --------------------------------------------------- | -------------------------------- | --------------- | ----------------------------------------------- |
| GET    | `/api/v1/attendance/schedule-templates`             | Query                            | ScheduleDraft[] | `hcm.attendance.work-schedule-templates.read`   |
| GET    | `/api/v1/attendance/schedule-templates/defaults`    | No query                         | ScheduleSeedDefaults | `hcm.attendance.work-schedule-templates.read` |
| GET    | `/api/v1/attendance/schedule-templates/{id}`        | Query                            | ScheduleDraft   | `hcm.attendance.work-schedule-templates.read`   |
| POST   | `/api/v1/attendance/schedule-templates`             | ScheduleDraft                    | ScheduleDraft   | `hcm.attendance.work-schedule-templates.draft`  |
| PATCH  | `/api/v1/attendance/schedule-templates/{id}`        | ScheduleDraft + expectedRevision | ScheduleDraft   | `hcm.attendance.work-schedule-templates.draft`  |
| POST   | `/api/v1/attendance/schedule-templates/{id}/versions` | VersionDraftCommand              | ScheduleDraft   | `hcm.attendance.work-schedule-templates.draft`  |
| POST   | `/api/v1/attendance/schedule-templates/{id}/preview` | ConfigurationPreview             | Preview         | `hcm.attendance.work-schedule-templates.preview` |
| POST   | `/api/v1/attendance/schedule-templates/{id}/publish` | PublishCommand                   | CommandResult   | `hcm.attendance.work-schedule-templates.publish` |
| POST   | `/api/v1/attendance/schedule-templates/{id}/copy`   | CopyCommand                      | ScheduleDraft   | `hcm.attendance.work-schedule-templates.draft`  |
| POST   | `/api/v1/attendance/schedule-templates/{id}/retire` | ReasonCommand                    | CommandResult   | `hcm.attendance.work-schedule-templates.retire` |

Every response has a purpose-built projection; private narrative/evidence requires
additional current field permission. No persistence row serialization. Disabled
encashment/device/pool/delegation/payment routes are absent, not successful stubs.

Lifecycle reconciliation: the FDD's reusable template is a Published template
version. The explicit versions/preview/publish endpoints above complete the
transport mapping for that already specified lifecycle. The `version` query
selects an exact version for detail, edit, preview, publish and retire; omission
on GET selects the latest version. Mutations must identify their exact version,
so another draft cannot redirect an action. CopyCommand.sourceVersionId must be
a currently Published version of the route's template. Copy creates an ordinary
schedule Draft; its immutable source reference never changes that template.
Published templates are never eligible for live assignments. Retirement preserves
existing copies. Configuration roots are tenant-level data and require one
tenant-wide operation grant; employment-scoped grants cannot curate global roots.

Template preview validates the reusable pattern and exact source revision. It
reports zero live assignments because the database forbids assigning templates;
it does not claim dated workforce/DST suitability for a subsequently created
schedule. That independent schedule requires its own scoped, dated impact preview
and publication before use. Publication never implicitly supplies a break or zone.

`ScheduleSeedDefaults` is a separate additive read DTO for an incomplete draft
proposal: id,revision,state=DraftDefaults,code,name,weekStartsOn and seven days
with weekday,kind,startTime?,endTime?,endDayOffset?,unpaidBreakMinutes. Rest days
have no envelope and zero break. It deliberately has no timezone, effective dates
or resolved duration. GET `/defaults` is declared before the `/:id` route. The
create form loads these persisted values, presents the unpaid minutes as awaiting
placement and requires the user to complete or explicitly change the proposal.
It never passes this DTO to a ScheduleDraft command or claims it is reusable.
Missing defaults return unavailable configuration; no browser fixture fallback.
The canonical development seed grants these explicit template operations to the
existing tenant-administrator role used for reference-data curation; title alone
never bypasses the persisted operation checks.

For a template preview, omitted effectiveTo means its explicit effectiveFrom date;
the inclusive range stays within source coverage and the common 366-date bound.
The synchronous Ready preview expires after 15 minutes (technical review freshness,
not a business scheduling rule), binds its authenticated actor and exact source
digest, and reports zero affected employments/workdays. Publish consumes it once
before advancing the Draft in the same transaction. A stale, expired, changed or
different actor's preview returns `preview-stale`; the client requests a new preview.

## AUTHORIZATION

Entitlement `hcm.attendance` and each endpoint's explicit
operation permission are both required. Logical access functions
`WORK_SCHEDULE_TEMPLATE_MANAGE` map to the enumerated operation grants,
never a role-name bypass. Seed only the relevant actions for the actor described
by the FDD: Time policy administrator with organization scope. Scope is one current grant covering the selected organizational/employment scope. Publish/decide/recover/lock/reopen/on-behalf
are distinct operation grants where listed. A read grant cannot imply them.
Workflow additionally checks source module entitlement and source decision grant
on every row/action. No combining partial scope grants, trusting UI visibility,
or relying on assignment/reporting as permission. Fresh session and source/task/
subject revisions are rechecked in the transaction; reasons and audit are retained.
Independent source slots cannot be satisfied by maker/beneficiary. No step-up
infrastructure or delegation creation is required/introduced in this release.

## DATA

Owning tables/read projections: work_schedule (is_template), work_schedule_version, work_schedule_day, work_schedule_segment.
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
by original key, never resent as a new decision. Audit each accepted/denied command under existing safe audit policy; encrypted reason and governed Documents attachments never leak into list rows or notifications.
Background dependencies: schedule configuration foundation.
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

| Project                                              | Root                                                      | Tags                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `hcm-attendance-contract`                            | `libs/hcm/contracts/attendance`                           | `product:hcm`, `runtime:universal`, `domain:attendance`, `type:contract` |
| `hcm-web-attendance-data-access`                     | `libs/hcm/web/attendance/data-access`                     | `product:hcm`, `runtime:web`, `domain:attendance`, `type:data-access`    |
| `hcm-web-attendance-feature-work-schedule-templates` | `libs/hcm/web/attendance/feature-work-schedule-templates` | `product:hcm`, `runtime:web`, `domain:attendance`, `type:feature`        |
| `hcm-api-attendance-domain`                          | `libs/hcm/api/attendance/domain`                          | `product:hcm`, `runtime:api`, `domain:attendance`, `type:domain`         |
| `hcm-api-attendance-application`                     | `libs/hcm/api/attendance/application`                     | `product:hcm`, `runtime:api`, `domain:attendance`, `type:application`    |
| `hcm-api-attendance-infrastructure`                  | `libs/hcm/api/attendance/infrastructure`                  | `product:hcm`, `runtime:api`, `domain:attendance`, `type:infrastructure` |
| `hcm-api-attendance-transport`                       | `libs/hcm/api/attendance/transport`                       | `product:hcm`, `runtime:api`, `domain:attendance`, `type:transport`      |
| `hcm-api-attendance-module`                          | `libs/hcm/api/attendance/module`                          | `product:hcm`, `runtime:api`, `domain:attendance`, `type:module`         |

## VERIFICATION

All test IDs in [traceability](TRACEABILITY.md) are planned acceptance cases, not
executed-test claims. Use real PostgreSQL/HTTP for tenant/concurrency/receipt
invariants, contract tests for DTO projections and pure unit tests for algorithms.
Production-app browser checks cover keyboard, narrow/desktop layout, native action
behavior, focus, validation, empty/error/retry and stale response clearing. Include
the owning domain's boundary suite. Design/readiness checks alone do not approve
the implemented app or floorplan.

## DESIGN-001

Requirement [REQ-WORK-SCHEDULE-TEMPLATES-001](FDD.md#req-work-schedule-templates-001). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Copying preserves source attribution; editing the copy never changes the template or any assigned schedule.

## DESIGN-002

Requirement [REQ-WORK-SCHEDULE-TEMPLATES-002](FDD.md#req-work-schedule-templates-002). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: A template ID supplied as a live assignment is denied; conflicting segments produce field-specific errors.

## DESIGN-003

Requirement [REQ-WORK-SCHEDULE-TEMPLATES-003](FDD.md#req-work-schedule-templates-003). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Previously copied/published schedules remain unchanged and a retired template is unavailable for new copies.

## DESIGN-004

Requirement [REQ-WORK-SCHEDULE-TEMPLATES-004](FDD.md#req-work-schedule-templates-004). Apply every API permission and exact current scope before row lookup/count or mutation. Exercise tenant and grant revocation in real SQL transactions, including a second own employment.
Acceptance target: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

## DESIGN-005

Requirement [REQ-WORK-SCHEDULE-TEMPLATES-005](FDD.md#req-work-schedule-templates-005). Use the selected native floorplan and semantic controls, cancel stale queries on context change and keep explicit error/empty/unavailable states. Verify focus and keyboard after every action.
Acceptance target: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

## DESIGN-006

Requirement [REQ-WORK-SCHEDULE-TEMPLATES-006](FDD.md#req-work-schedule-templates-006). Enforce the DATA and CONSISTENCY transaction boundaries; inject failure before/after commit and replay the same key. Read-only surfaces expose no write route.
Acceptance target: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## DELIVERY

Branch `codex/hcm-3-work-schedule-templates`. Prerequisite foundations must be merged before app
delivery; follow the [ordered foundation plan](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#order).
Planned coherent commits:

1. `feat(hcm-attendance): add work-schedule-templates contracts and domain behavior`
2. `feat(hcm-attendance): persist work-schedule-templates with authorization and receipts`
3. `feat(hcm-attendance): add work-schedule-templates native application experience`
4. `test(hcm-attendance): verify work-schedule-templates acceptance and document evidence`

Omit persistence mutations for read-only slices; reuse admitted domain foundation
work rather than duplicate tables. PR CI never deploys. No implementation occurs
as part of this Step-1 design package.
