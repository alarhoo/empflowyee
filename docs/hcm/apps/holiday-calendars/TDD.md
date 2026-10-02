# Holiday Calendars — technical design

Status: approved technical design, 2026-09-28, following the approved [FDD](FDD.md)
and [product-owner delegation](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation
status is maintained in [traceability](TRACEABILITY.md). The owning [attendance TDD](../../domains/attendance/TECHNICAL-DESIGN.md),
[shared TDD](../../architecture/TDD-HCM-3-COMMON.md) and
[SQL/integration TDD](../../architecture/TDD-HCM-3-DATA-MODEL.md) are normative parts
of this design; the blueprint binds their exact reviewed revisions.

## ROUTE

App `HOLIDAY_CALENDARS`, owner `attendance`, route `/attendance/holiday-calendars`. Child routes: base list, `/:id` selected detail, `/new` draft create, `/:id/edit` draft edit.
Route IDs are opaque resource IDs (dayId for attendance day, taskId for inbox,
caseId for approval, configuration rootId plus version query for configuration).
Where no single-resource GET is listed, selected detail reloads the collection
with exact `id` filter and requires exactly one authorized row; otherwise 404.
The feature lazy loads from `libs/hcm/web/attendance/feature-holiday-calendars`. Discovery permission
`hcm.catalogue.HOLIDAY_CALENDARS.discover` reveals navigation only; every API uses
business authorization. Unavailable dependencies render an honest state.
Canonical discovery includes HR Operations / Projects, Time, and Leave and
Administration / Reference Data and Policies / Process and Time. The existing
Tenant Administrator's calendar operation grants are independent of those
placements; adding navigation never grants another role or another business action.

## FLOORPLAN

`UX-FP-FCL` / `NATIVE`. Native FlexibleColumnLayout, HcmDynamicPage list in begin column and HcmObjectPage detail in middle; each column owns its page header. Complex create/edit stays on the dedicated draft route where declared; focused decision/reason uses a native Dialog.
No custom CSS or theme logic. Detail title uses Close and Maximize/Minimize; native
responsive layout shows one active column on narrow screens and restores list
focus on close. Important data: Calendar/version, date/category, observed date, partial interval, priority, scope, impact counts and safe conflict explanation.
Semantic fields use ObjectStatus for state, DatePicker/TimePicker for local time,
DateTimePicker for corrected instants, Select/ComboBox for authorized IDs/enums,
TextArea for reasons and FileUploader for governed evidence. Numeric unit/time
formatters preserve decimal/exact values with explicit units and timezone labels.
Signal Forms applies common and owning DTO validators on input and submit; published payloads are read-only. Source field errors remain attached to controls and summary.
Table ownership is server-side. Allowlisted sort keys: `code, name, state, id`; fields absent
from a resource DTO are rejected for that resource. Filter IDs, state and bounded
date range only. Calendar filters use from/to and authorized employment; configuration
lists use code/name/state. The common cursor contract binds all query parameters.

Holiday lists use the latest version of each calendar before filters, with literal
case-insensitive code/name substring filters and exact id/state filters. Sort is
code/name/state/id, optional asc/desc, default code:asc and same-direction root-ID
tie-break. Limit defaults to 25 and rejects values outside 1-100. Duplicate or
unknown parameters fail. Exact detail uses the declared root/version path and
accepts no query; writes accept no query. Source-version selection for successor
is in the body. No latest-version substitution is allowed on mutation.

Continuation uses the existing Attendance hash-only cursor mechanics, bound to
actor, current tenant-wide grant, app, normalized query and monotonic source
revision generation, with a 15-minute expiry. A calendar mutation invalidates its
continuations. Cursor schema uses generated typed root references selected by the
closed app code, with tenant-composite FKs for both calendars and schedules.
This adds Holiday support without changing existing schedule handle semantics.

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

### Date binding and field restrictions

The installed UI5 2.26 DatePicker retains its previous `value` during `input`
and commits the edited date on `change`. Fundamental 0.64.3 GenericControlValueAccessor
normally forwards both events. Browser acceptance exposed lost date text during
rapid keyboard/paste entry when that stale input value is forwarded. The shared
UX Forms `HcmDateField` directive changes only the injected accessor event list to
`change`. Native parsing, calendar interaction, focus and accessibility remain
unchanged; the same Signal Form validates committed dates on blur and submit.
It reads no shadow DOM and introduces no second form model. Holiday date controls
consume this binding; numeric StepInput uses its documented native value events
because its installed wrapper does not expose a ControlValueAccessor.

| Field | Restriction |
| --- | --- |
| Code | Required string, 1–40, starts with A–Z, then uppercase letters/digits/underscore/hyphen; immutable after create |
| Calendar/holiday name | Required preserved nonblank string, at most 120 characters |
| Effective from/to | Required from, optional ordered to; ISO date contract, localized native presentation |
| Actual/observed dates | Both required explicit ISO dates; observed date within version coverage |
| Category | Required Public, Company, Regional or Substitute |
| Priority | Required integer from −2147483648 to 2147483647; incomplete input invalid |
| Region/location | Optional nonblank region up to 120; optional authorized location ID |
| Partial interval | Both endpoints or neither; exact local time to milliseconds, end strictly after start |
| Repeated endpoint | Optional Earlier/Later, only with partial interval; ambiguity checked in actual zone |
| Publication context | Explicit authorized employment and valid IANA timezone; ordered review range within version, at most 366 dates |
| Action reason | Required nonblank preserved string, maximum 2,000 |
| Search/filter text | Reference search 120; list code 40/name 120; closed state/sort enums |

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

| Method | Exact route                                                            | Request schema                  | Response schema | Business permission                        |
| ------ | ---------------------------------------------------------------------- | ------------------------------- | --------------- | ------------------------------------------ |
| GET    | `/api/v1/attendance/holiday-calendars`                                 | Query                           | HolidayDraft[]  | `hcm.attendance.holiday-calendars.read`    |
| POST   | `/api/v1/attendance/holiday-calendars`                                 | HolidayDraft                    | HolidayDraft    | `hcm.attendance.holiday-calendars.draft`   |
| POST   | `/api/v1/attendance/holiday-calendars/{id}/versions`                   | VersionDraftCommand             | HolidayDraft    | `hcm.attendance.holiday-calendars.draft`   |
| GET    | `/api/v1/attendance/holiday-calendars/{id}/versions/{version}`         | Query                           | HolidayDraft    | `hcm.attendance.holiday-calendars.read`    |
| PATCH  | `/api/v1/attendance/holiday-calendars/{id}/versions/{version}`         | HolidayDraft + expectedRevision | HolidayDraft    | `hcm.attendance.holiday-calendars.draft`   |
| POST   | `/api/v1/attendance/holiday-calendars/{id}/versions/{version}/preview` | ConfigurationPreview            | Preview         | `hcm.attendance.holiday-calendars.preview` |
| POST   | `/api/v1/attendance/holiday-calendars/{id}/versions/{version}/publish` | PublishCommand                  | CommandResult   | `hcm.attendance.holiday-calendars.publish` |
| POST   | `/api/v1/attendance/holiday-calendars/{id}/versions/{version}/retire`  | ReasonCommand                   | CommandResult   | `hcm.attendance.holiday-calendars.retire`  |
| POST   | `/api/v1/attendance/holiday-calendar-assignments`                      | AssignmentCommand               | CommandResult   | `hcm.attendance.holiday-calendars.manage`  |

Every response has a purpose-built projection; private narrative/evidence requires
additional current field permission. No persistence row serialization. Disabled
encashment/device/pool/delegation/payment routes are absent, not successful stubs.

### Explicit publication context

DEC-HCM3-024 requires `employmentId` and `timezone` on Holiday publication preview,
in addition to `expectedRevision,effectiveFrom,effectiveTo?`. The bounded review
window follows the common 366-date limit and must lie within source coverage.
The worker validates the union of that window and every declared observed date;
the query bound does not limit a calendar's lifespan. On each date, Workforce must
provide an available employment and a unique primary assignment location whose
timezone matches the explicitly selected IANA zone. Missing or changed facts,
DST gaps, unresolved repeated endpoints and equal-priority applicable collisions
prevent publication. The calendar itself acquires neither an assignment nor a zone.

`POST .../{id}/versions/{version}/preview` returns 202 and `HolidayPreviewView`:
`previewId,operationId,statusUrl,state,digest?,affectedEmploymentCount?,
affectedWorkdayCount?,conflicts?,lockedImpact?,failureCode?,expiresAt`.
Unexecuted result fields are null. `GET .../{id}/versions/{version}/previews/{preview}`
requires the independent read grant, accepts no query, and hides another actor's
or source's preview. The operation ID is the preview ID; the status URL is this
exact authenticated resource path. Counts describe the explicit validation
employment and reviewed dates, not assignments that have not been created.

Migration 47 adds immutable `holiday_publication_context` with tenant-composite
references to the existing preview and employment. The preview producer, encrypted
command receipt, audit and AttendanceResolve outbox intent commit together.
`attendance.holiday.preview` schema 1 executes through the existing worker lane;
lease-fenced completion stores Ready/Failed evidence atomically. It cannot publish.
Publication rechecks actor authority, source revision/content, all dated Workforce
digests and ascending monthly period fences before consuming Ready evidence and
freezing the version. The review expires after 15 minutes. Closing/Locked/Reopened
periods block publication. Same-key recovery retains the original accepted result
and still requires current read authority.

The focused native publication Dialog uses authorized Worker/Employment selectors,
explicit timezone ComboBox, DatePickers and reason.
Signal Forms and the shared parser validate the context; edited context invalidates
displayed review evidence. Running/Failed/Expired never enable publication. The
dialog refreshes real worker status and preserves uncertain command retry keys.
Assignment remains a separate command with validation of its actual target scope;
publication review does not authorize or replace that validation.

### Reference selectors

`GET /api/v1/attendance/holiday-calendars/references/workers` and
`GET /api/v1/attendance/holiday-calendars/references/workers/{worker}/employments`
require the calendar preview permission. `GET .../references/locations` requires
the calendar draft permission. All use the calendar's existing tenant-wide
curation boundary and the independent `hcm.attendance` entitlement; no Employee
Changes or organization-maintenance permission is granted by a calendar action.

The closed query is `asOf` (required ISO date) and `q` (optional, maximum 120
characters); unknown or duplicate fields fail. Workforce's existing records,
change-context and structure-reference owner ports run in the same authorized
transaction. Options project only `{id,code,name}` and `hasMore`; employment choices
project only `{employmentId,legalEntityName}`. No private HR facts, owner cursor or
mutation affordance is serialized. At most 100 options are returned and excess
matches instruct the user to narrow by name or code. Selection remains explicit,
including workers with concurrent employments. These reference results do not
replace authoritative dated validation at preview/publication.

### Assignment command refinement

Assignment uses the existing typed `AssignmentCommand`, with required
`expectedRevision` naming the Published calendar revision. Optional
`supersedes: {id,expectedRevision}` explicitly ends an existing assignment of the
same target on the day before `effectiveFrom`, then inserts the successor in the
same transaction. It cannot overwrite the old version or change its start date.
An overlapping insert without this exact supersession remains a conflict.

`resolutionFrom,resolutionTo` are required, inclusive dates within the assignment,
bounded to 366 dates for one command. They select durable workday production,
not the lifespan of an open-ended assignment. Validation also includes every
declared observed holiday within assignment coverage. The command queues only this explicit window; later approved configuration
commands must explicitly request additional dates. No implicit current-year or
rolling horizon is created.
Missing schedule/policy inputs leave resolution explicitly Unavailable; a holiday
assignment cannot manufacture those inputs. My Schedule reads stored workdays
only, and never creates work from a GET.

The command authorizes the target predicate and every affected dated Workforce
subject using one complete current manage grant. Current account, operation and
entitlement checks precede source lookups. Dated enumeration uses the existing
Workforce owner port, and the same tenant mutation/revocation lock protects
authorization, validation and commit. Empty scopes cannot acquire broader rights.
Ascending month fences cover changed dates; Closing/Locked/Reopened prevents
ordinary reassignment. Scoped DST/collision checks use real employment/location
facts. Equal-precedence selection ties fail even across different targets.

The native ObjectPage Assignments tab contains scope, target, dated coverage,
explicit resolution window, reason and an explicit supersession CheckBox. Scope
is one of the seven contract kinds; target is a required authorized selector
except for Tenant. From and both resolution dates are required ISO dates; To is
optional and ordered. Resolution is at most 366 dates within assignment coverage.
Reason is required, non-whitespace and at most 2,000 characters. Supersession is
boolean and binds the exact inspected predecessor revision. Contract parsers
validate both Signal Forms and HTTP commands; invalid submission stays local.

`GET /api/v1/attendance/holiday-calendar-assignments` accepts only
`kind,id?,asOf`, with id forbidden for Tenant and required otherwise. The read
grant must cover that exact target. It returns the current dated assignment or
null, including safe calendar name, version, target, coverage and revision.
It neither enumerates unrelated assignments nor produces work.

`GET /api/v1/attendance/holiday-calendars/assignment-references/{kind}` accepts
workers, locations, legal-entities, units or departments. The corresponding
`.../assignment-references/workers/{worker}/context` returns only minimal dated
employment and assignment choices. Both require tenant-wide calendar read and
Attendance entitlement, use the same closed asOf/q query and 100-option limit as
publication selectors, and confer no write authority. The assignment command
independently rechecks manage authority over all affected subjects.

Assignment, any predecessor end, encrypted reason, audit, receipt and durable
workday intents commit atomically. Each Available assigned resolution contributes
its exact accepted digest to the existing `attendance.workday.resolve` handler.
The result reports assignment identity/revision and queued/unavailable counts;
queued is not completion. Source changes before execution retain InputChanged
evidence. Existing published workdays remain immutable.

## AUTHORIZATION

Entitlement `hcm.attendance` and each endpoint's explicit
operation permission are both required. Logical access functions
`HOLIDAY_CALENDAR_MANAGE` map to the enumerated operation grants,
never a role-name bypass. Seed only the relevant actions for the actor described
by the FDD: Time policy administrator and publisher. Scope is one current grant covering the selected organizational/employment scope. Publish/decide/recover/lock/reopen/on-behalf
are distinct operation grants where listed. A read grant cannot imply them.
Workflow additionally checks source module entitlement and source decision grant
on every row/action. No combining partial scope grants, trusting UI visibility,
or relying on assignment/reporting as permission. Fresh session and source/task/
subject revisions are rechecked in the transaction; reasons and audit are retained.
Independent source slots cannot be satisfied by maker/beneficiary. No step-up
infrastructure or delegation creation is required/introduced in this release.

## DATA

Owning tables/read projections: holiday_calendar, holiday_calendar_version, holiday, holiday_calendar_assignment, time_configuration_impact_preview.
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
Background dependencies: workforce time context, versioned configuration, impact worker.
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

| Project                                        | Root                                                | Tags                                                                     |
| ---------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `hcm-attendance-contract`                      | `libs/hcm/contracts/attendance`                     | `product:hcm`, `runtime:universal`, `domain:attendance`, `type:contract` |
| `hcm-web-attendance-data-access`               | `libs/hcm/web/attendance/data-access`               | `product:hcm`, `runtime:web`, `domain:attendance`, `type:data-access`    |
| `hcm-web-attendance-feature-holiday-calendars` | `libs/hcm/web/attendance/feature-holiday-calendars` | `product:hcm`, `runtime:web`, `domain:attendance`, `type:feature`        |
| `hcm-api-attendance-domain`                    | `libs/hcm/api/attendance/domain`                    | `product:hcm`, `runtime:api`, `domain:attendance`, `type:domain`         |
| `hcm-api-attendance-application`               | `libs/hcm/api/attendance/application`               | `product:hcm`, `runtime:api`, `domain:attendance`, `type:application`    |
| `hcm-api-attendance-infrastructure`            | `libs/hcm/api/attendance/infrastructure`            | `product:hcm`, `runtime:api`, `domain:attendance`, `type:infrastructure` |
| `hcm-api-attendance-transport`                 | `libs/hcm/api/attendance/transport`                 | `product:hcm`, `runtime:api`, `domain:attendance`, `type:transport`      |
| `hcm-api-attendance-module`                    | `libs/hcm/api/attendance/module`                    | `product:hcm`, `runtime:api`, `domain:attendance`, `type:module`         |

## VERIFICATION

[Traceability](TRACEABILITY.md) maps acceptance cases to executed evidence;
its linked validation record distinguishes completed checks from remaining work. Use real PostgreSQL/HTTP for tenant/concurrency/receipt
invariants, contract tests for DTO projections and pure unit tests for algorithms.
Production-app browser checks cover keyboard, narrow/desktop layout, native action
behavior, focus, validation, empty/error/retry and stale response clearing. Include
the owning domain's boundary suite. Design/readiness checks alone do not approve
the implemented app or floorplan.

## DESIGN-001

Requirement [REQ-HOLIDAY-CALENDARS-001](FDD.md#req-holiday-calendars-001). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Invalid partial ranges or unresolved collisions block preview/publication; observed dates are never silently guessed.

## DESIGN-002

Requirement [REQ-HOLIDAY-CALENDARS-002](FDD.md#req-holiday-calendars-002). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: A changed draft/workforce input makes the preview stale; publication freezes content and leaves historical referenced versions intact.

## DESIGN-003

Requirement [REQ-HOLIDAY-CALENDARS-003](FDD.md#req-holiday-calendars-003). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Equal-precedence overlapping assignments fail and unrelated scopes keep their calendars.

## DESIGN-004

Requirement [REQ-HOLIDAY-CALENDARS-004](FDD.md#req-holiday-calendars-004). Apply every API permission and exact current scope before row lookup/count or mutation. Exercise tenant and grant revocation in real SQL transactions, including a second own employment.
Acceptance target: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

## DESIGN-005

Requirement [REQ-HOLIDAY-CALENDARS-005](FDD.md#req-holiday-calendars-005). Use the selected native floorplan and semantic controls, cancel stale queries on context change and keep explicit error/empty/unavailable states. Verify focus and keyboard after every action.
Acceptance target: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

## DESIGN-006

Requirement [REQ-HOLIDAY-CALENDARS-006](FDD.md#req-holiday-calendars-006). Enforce the DATA and CONSISTENCY transaction boundaries; inject failure before/after commit and replay the same key. Read-only surfaces expose no write route.
Acceptance target: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## DELIVERY

Branch `codex/hcm-3-holiday-calendars`. Prerequisite foundations must be merged before app
delivery; follow the [ordered foundation plan](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#order).
Planned coherent commits:

1. `feat(hcm-attendance): add holiday-calendars contracts and domain behavior`
2. `feat(hcm-attendance): persist holiday-calendars with authorization and receipts`
3. `feat(hcm-attendance): add holiday-calendars native application experience`
4. `test(hcm-attendance): verify holiday-calendars acceptance and document evidence`

Omit persistence mutations for read-only slices; reuse admitted domain foundation
work rather than duplicate tables. PR CI never deploys. No implementation occurs
as part of this Step-1 design package.
