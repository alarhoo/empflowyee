# Work Schedules — technical design

Status: approved technical design, 2026-09-28, following the approved [FDD](FDD.md)
and [product-owner delegation](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation
is planned. The owning [attendance TDD](../../domains/attendance/TECHNICAL-DESIGN.md),
[shared TDD](../../architecture/TDD-HCM-3-COMMON.md) and
[SQL/integration TDD](../../architecture/TDD-HCM-3-DATA-MODEL.md) are normative parts
of this design; the blueprint binds their exact reviewed revisions.

## ROUTE

App `WORK_SCHEDULES`, owner `attendance`, route `/attendance/work-schedules`. Child routes: base list, `/:id` selected detail, `/new` draft create, `/:id/edit` draft edit.
Route IDs are opaque resource IDs (dayId for attendance day, taskId for inbox,
caseId for approval, configuration rootId plus version query for configuration).
Where no single-resource GET is listed, selected detail reloads the collection
with exact `id` filter and requires exactly one authorized row; otherwise 404.
The feature lazy loads from `libs/hcm/web/attendance/feature-work-schedules`. Discovery permission
`hcm.catalogue.WORK_SCHEDULES.discover` reveals navigation only; every API uses
business authorization. Unavailable dependencies render an honest state.

## FLOORPLAN

`UX-FP-FCL` / `NATIVE`. Native FlexibleColumnLayout, HcmDynamicPage list in begin column and HcmObjectPage detail in middle; each column owns its page header. Complex create/edit stays on the dedicated draft route where declared; focused decision/reason uses a native Dialog.
No custom CSS or theme logic. Detail title uses Close and Maximize/Minimize; native
responsive layout shows one active column on narrow screens and restores list
focus on close. Important data: Schedule/shift/policy versions, rules, assignments, impact results and selected workday basis.
Semantic fields use ObjectStatus for state, DatePicker/TimePicker for local time,
DateTimePicker for corrected instants, Select/ComboBox for authorized IDs/enums,
TextArea for reasons and FileUploader for governed evidence. Numeric unit/time
formatters preserve decimal/exact values with explicit units and timezone labels.
Signal Forms applies common and owning DTO validators on input and submit; published payloads are read-only. Source field errors remain attached to controls and summary.
Table ownership is server-side. Allowlisted sort keys: `code, name, state, id`; fields absent
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

| Method | Exact route                                                         | Request schema                           | Response schema         | Business permission                     |
| ------ | ------------------------------------------------------------------- | ---------------------------------------- | ----------------------- | --------------------------------------- |
| GET    | `/api/v1/attendance/work-schedules`                                 | Query                                    | ScheduleDraft[]         | `hcm.attendance.work-schedules.read`    |
| POST   | `/api/v1/attendance/work-schedules`                                 | ScheduleDraft                            | ScheduleDraft           | `hcm.attendance.work-schedules.draft`   |
| POST   | `/api/v1/attendance/work-schedules/{id}/versions`                   | VersionDraftCommand                      | ScheduleDraft           | `hcm.attendance.work-schedules.draft`   |
| GET    | `/api/v1/attendance/work-schedules/{id}/versions/{version}`         | Query                                    | ScheduleDraft           | `hcm.attendance.work-schedules.read`    |
| PATCH  | `/api/v1/attendance/work-schedules/{id}/versions/{version}`         | ScheduleDraft + expectedRevision         | ScheduleDraft           | `hcm.attendance.work-schedules.draft`   |
| POST   | `/api/v1/attendance/work-schedules/{id}/versions/{version}/preview` | ConfigurationPreview                     | Preview                 | `hcm.attendance.work-schedules.preview` |
| POST   | `/api/v1/attendance/work-schedules/{id}/versions/{version}/publish` | PublishCommand                           | CommandResult           | `hcm.attendance.work-schedules.publish` |
| POST   | `/api/v1/attendance/work-schedules/{id}/versions/{version}/retire`  | ReasonCommand                            | CommandResult           | `hcm.attendance.work-schedules.retire`  |
| GET    | `/api/v1/attendance/shifts`                                         | Query                                    | ShiftDraft[]            | `hcm.attendance.work-schedules.read`    |
| POST   | `/api/v1/attendance/shifts`                                         | ShiftDraft                               | ShiftDraft              | `hcm.attendance.work-schedules.draft`   |
| POST   | `/api/v1/attendance/shifts/{id}/versions`                           | VersionDraftCommand                      | ShiftDraft              | `hcm.attendance.work-schedules.draft`   |
| GET    | `/api/v1/attendance/shifts/{id}/versions/{version}`                 | Query                                    | ShiftDraft              | `hcm.attendance.work-schedules.read`    |
| PATCH  | `/api/v1/attendance/shifts/{id}/versions/{version}`                 | ShiftDraft + expectedRevision            | ShiftDraft              | `hcm.attendance.work-schedules.draft`   |
| POST   | `/api/v1/attendance/shifts/{id}/versions/{version}/preview`         | ConfigurationPreview                     | Preview                 | `hcm.attendance.work-schedules.preview` |
| POST   | `/api/v1/attendance/shifts/{id}/versions/{version}/publish`         | PublishCommand                           | CommandResult           | `hcm.attendance.work-schedules.publish` |
| POST   | `/api/v1/attendance/shifts/{id}/versions/{version}/retire`          | ReasonCommand                            | CommandResult           | `hcm.attendance.work-schedules.retire`  |
| GET    | `/api/v1/attendance/policies`                                       | Query                                    | AttendancePolicyDraft[] | `hcm.attendance.work-schedules.read`    |
| POST   | `/api/v1/attendance/policies`                                       | AttendancePolicyDraft                    | AttendancePolicyDraft   | `hcm.attendance.work-schedules.draft`   |
| POST   | `/api/v1/attendance/policies/{id}/versions`                         | VersionDraftCommand                      | AttendancePolicyDraft   | `hcm.attendance.work-schedules.draft`   |
| GET    | `/api/v1/attendance/policies/{id}/versions/{version}`               | Query                                    | AttendancePolicyDraft   | `hcm.attendance.work-schedules.read`    |
| PATCH  | `/api/v1/attendance/policies/{id}/versions/{version}`               | AttendancePolicyDraft + expectedRevision | AttendancePolicyDraft   | `hcm.attendance.work-schedules.draft`   |
| POST   | `/api/v1/attendance/policies/{id}/versions/{version}/preview`       | ConfigurationPreview                     | Preview                 | `hcm.attendance.work-schedules.preview` |
| POST   | `/api/v1/attendance/policies/{id}/versions/{version}/publish`       | PublishCommand                           | CommandResult           | `hcm.attendance.work-schedules.publish` |
| POST   | `/api/v1/attendance/policies/{id}/versions/{version}/retire`        | ReasonCommand                            | CommandResult           | `hcm.attendance.work-schedules.retire`  |
| POST   | `/api/v1/attendance/schedule-assignments`                           | AssignmentCommand                        | CommandResult           | `hcm.attendance.work-schedules.manage`  |
| POST   | `/api/v1/attendance/policy-assignments`                             | AssignmentCommand                        | CommandResult           | `hcm.attendance.work-schedules.manage`  |
| GET    | `/api/v1/attendance/workdays`                                       | Query                                    | WorkdayView[]           | `hcm.attendance.work-schedules.read`    |
| POST   | `/api/v1/attendance/overrides`                                      | OverrideDraft                            | CommandResult           | `hcm.attendance.work-schedules.manage`  |
| POST   | `/api/v1/attendance/overrides/{id}/preview`                         | ReasonCommand                            | Preview                 | `hcm.attendance.work-schedules.preview` |
| POST   | `/api/v1/attendance/overrides/{id}/submit`                          | SubmitCommand                            | CommandResult           | `hcm.attendance.work-schedules.manage`  |

Every response has a purpose-built projection; private narrative/evidence requires
additional current field permission. No persistence row serialization. Disabled
encashment/device/pool/delegation/payment routes are absent, not successful stubs.

## AUTHORIZATION

Entitlement `hcm.attendance` and each endpoint's explicit
operation permission are both required. Logical access functions
`WORK_SCHEDULE_MANAGE` map to the enumerated operation grants,
never a role-name bypass. Seed only the relevant actions for the actor described
by the FDD: Time policy administrator and authorized publisher. Scope is one current grant covering the selected organizational/employment scope. Publish/decide/recover/lock/reopen/on-behalf
are distinct operation grants where listed. A read grant cannot imply them.
Workflow additionally checks source module entitlement and source decision grant
on every row/action. No combining partial scope grants, trusting UI visibility,
or relying on assignment/reporting as permission. Fresh session and source/task/
subject revisions are rechecked in the transaction; reasons and audit are retained.
Independent source slots cannot be satisfied by maker/beneficiary. No step-up
infrastructure or delegation creation is required/introduced in this release.

## DATA

Owning tables/read projections: schedule/shift/policy version families, assignments, published_workday, published_work_segment.
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
Background dependencies: holiday foundation, workforce time context, impact worker.
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

| Project                                     | Root                                             | Tags                                                                     |
| ------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `hcm-attendance-contract`                   | `libs/hcm/contracts/attendance`                  | `product:hcm`, `runtime:universal`, `domain:attendance`, `type:contract` |
| `hcm-web-attendance-data-access`            | `libs/hcm/web/attendance/data-access`            | `product:hcm`, `runtime:web`, `domain:attendance`, `type:data-access`    |
| `hcm-web-attendance-feature-work-schedules` | `libs/hcm/web/attendance/feature-work-schedules` | `product:hcm`, `runtime:web`, `domain:attendance`, `type:feature`        |
| `hcm-api-attendance-domain`                 | `libs/hcm/api/attendance/domain`                 | `product:hcm`, `runtime:api`, `domain:attendance`, `type:domain`         |
| `hcm-api-attendance-application`            | `libs/hcm/api/attendance/application`            | `product:hcm`, `runtime:api`, `domain:attendance`, `type:application`    |
| `hcm-api-attendance-infrastructure`         | `libs/hcm/api/attendance/infrastructure`         | `product:hcm`, `runtime:api`, `domain:attendance`, `type:infrastructure` |
| `hcm-api-attendance-transport`              | `libs/hcm/api/attendance/transport`              | `product:hcm`, `runtime:api`, `domain:attendance`, `type:transport`      |
| `hcm-api-attendance-module`                 | `libs/hcm/api/attendance/module`                 | `product:hcm`, `runtime:api`, `domain:attendance`, `type:module`         |

## VERIFICATION

All test IDs in [traceability](TRACEABILITY.md) are planned acceptance cases, not
executed-test claims. Use real PostgreSQL/HTTP for tenant/concurrency/receipt
invariants, contract tests for DTO projections and pure unit tests for algorithms.
Production-app browser checks cover keyboard, narrow/desktop layout, native action
behavior, focus, validation, empty/error/retry and stale response clearing. Include
the owning domain's boundary suite. Design/readiness checks alone do not approve
the implemented app or floorplan.

## DESIGN-001

Requirement [REQ-WORK-SCHEDULES-001](FDD.md#req-work-schedules-001). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Derived planned minutes agree with resolved segments; unsupported variants and incomplete overtime/capture rules cannot publish.

## DESIGN-002

Requirement [REQ-WORK-SCHEDULES-002](FDD.md#req-work-schedules-002). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Equal-precedence conflicts block the day; a missing schedule is distinct from a deliberately unscheduled day.

## DESIGN-003

Requirement [REQ-WORK-SCHEDULES-003](FDD.md#req-work-schedules-003). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Changed source digests reject publication; open days receive new resolution revisions while locked history is preserved.

## DESIGN-004

Requirement [REQ-WORK-SCHEDULES-004](FDD.md#req-work-schedules-004). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: A cross-midnight shift belongs to the start date and DST ambiguity never silently guesses an instant.

## DESIGN-005

Requirement [REQ-WORK-SCHEDULES-005](FDD.md#req-work-schedules-005). Apply every API permission and exact current scope before row lookup/count or mutation. Exercise tenant and grant revocation in real SQL transactions, including a second own employment.
Acceptance target: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

## DESIGN-006

Requirement [REQ-WORK-SCHEDULES-006](FDD.md#req-work-schedules-006). Use the selected native floorplan and semantic controls, cancel stale queries on context change and keep explicit error/empty/unavailable states. Verify focus and keyboard after every action.
Acceptance target: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

## DESIGN-007

Requirement [REQ-WORK-SCHEDULES-007](FDD.md#req-work-schedules-007). Enforce the DATA and CONSISTENCY transaction boundaries; inject failure before/after commit and replay the same key. Read-only surfaces expose no write route.
Acceptance target: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## DELIVERY

Branch `codex/hcm-3-work-schedules`. Prerequisite foundations must be merged before app
delivery; follow the [ordered foundation plan](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#order).
Planned coherent commits:

1. `feat(hcm-attendance): add work-schedules contracts and domain behavior`
2. `feat(hcm-attendance): persist work-schedules with authorization and receipts`
3. `feat(hcm-attendance): add work-schedules native application experience`
4. `test(hcm-attendance): verify work-schedules acceptance and document evidence`

Omit persistence mutations for read-only slices; reuse admitted domain foundation
work rather than duplicate tables. PR CI never deploys. No implementation occurs
as part of this Step-1 design package.

## DATED-RESOLUTION

Apply the owning Attendance ALGORITHM for approved DEC-HCM3-022/023. Keep independent
schedule/policy rule outcomes and their source revisions. Resolve timezone from
current dated Workforce assignment/location facts; never use display preferences
or first-row selection. The source resolver returns unavailable for missing or
ambiguous authority facts. The approval update records the product owner's two
explicit Step-2 answers and Codex's technical integration review.

## DELIVERY-INTEGRATION

The ordinary schedule Draft routes reuse `AttendanceScheduleDrafts` and its exact
version repository. `GET /api/v1/attendance/work-schedules/defaults` reads the same
persisted incomplete proposal as Templates under `work-schedules.read`; it never
supplies a timezone or break placement. Shift and policy commands reuse the
existing typed tables, universal validators, encrypted receipts and audit events.
Their list cursors extend the existing Attendance cache with tenant-composite
shift/policy references in forward migration 48.

Policy publication reviews complete explicit rules of an unassigned Draft. The
source transaction verifies that no assignment references that Draft, so this
operation has no affected live workdays or Leave calculations. It does not apply
the policy to an employment. Assignment is a separate dated operation and must
evaluate the actual selected schedule, holiday calendar and independent rest rules.

Schedule and shift previews add required `employmentId` to ConfigurationPreview.
The preview is a proposed use in that real employment, not a new assignment.
Timezone follows the source mode and dated Workforce facts. Schedule review uses
the proposed weekly pattern within source validity and actual prior history
outside it; a reusable shift substitutes only the reviewed date. The production
resolver supplies exact intervals, holiday matching and independent rest checks.
Missing policy/calendar/history remains unavailable. No proposed projection is
written to `published_workday`.

Forward migration 49 stores immutable employment context with typed source family
and tenant references. The `attendance.configuration.preview` schema-1 handler
runs on the existing AttendanceResolve lane. Source revision, dated dependencies
and period evidence bind the result. Publication recomputes and compares that
evidence before consuming it. The source-specific status endpoint is
`GET /api/v1/attendance/{work-schedules|shifts}/{id}/versions/{version}/previews/{preview}`;
it requires the originating app's current read grant and original actor identity.

Schedule/policy assignments use the existing seven typed targets, exact source
revision, optional exact predecessor revision and explicit `resolutionFrom` /
`resolutionTo` (at most 366 inclusive days within assignment coverage). The bounded
execution window does not shorten business coverage. Reads at
`GET /api/v1/attendance/{schedule-assignments|policy-assignments}` require exact
`kind`, non-Tenant `id`, and `asOf`. Shared preparation retains one complete grant
for the target and all dated subjects, period fences and atomic supersession.
Available workdays enqueue the existing exact-digest resolver intent; incomplete
prerequisites are counted as unavailable rather than stored as zero work.
Leave integration and override acceptance remain part of the full app delivery;
these implemented commands alone do not satisfy them.

The Attendance-owned `hcm-web-attendance-ui-schedule-pattern` library has tags
`product:hcm,runtime:web,domain:attendance,type:ui`. It extracts the existing
Templates form conversion, Signal Form state and maintained native controls.
It owns no page, HTTP query, route or runtime session. Features retain those
responsibilities and supply date/time formats and their form state. Shared
`HcmDateField` preserves native DatePicker change semantics. No feature imports
another feature implementation, and no new architectural type is introduced.

## EDITOR-INTEGRATION

The FCL collection selects Schedule, Shift or Policy through the closed `family`
query parameter. Root/version identity remains explicit. Ordinary schedule draft
routes retain `/new` and `/:id/edit`; reusable shifts use `/shift/new` and
`/:id/shift-edit`, and Attendance policies use `/policy/new` and `/:id/policy-edit`.
All complex editors are dedicated Dynamic Pages with footer actions and the same
dirty-navigation protection. List queries remain server-owned per family.

The shared pattern controls support a single reusable shift without a weekly
pattern. The Shift parser receives only shift fields; temporary interval-group
indexing is UI state, never a persisted weekly schedule. Templates retain the
existing seven-day editor. Source-specific publication dialogs distinguish a
durable proposed-employment preview from an unassigned policy rule review.

Minimal Workforce references reuse the existing owner projection through
`GET /api/v1/attendance/work-schedules/references/{kind}` and
`GET /api/v1/attendance/work-schedules/references/workers/{worker}/context`.
Closed kinds are workers, locations, legal-entities, units and departments;
`q` is optional with maximum 120 characters and `asOf` is required. A current
tenant-wide Work Schedules read grant precedes every selector read. No calendar
permission, private HR fields or implicit primary employment is used.

All policy field restrictions are the existing `parseAttendancePolicyDraft`
contract, applied in Signal Forms and again on the API. Code is required, at most
40 characters, matching `[A-Z][A-Z0-9_-]*`; name is required nonblank text, at most
120 characters. Effective dates are ISO calendar dates; optional end cannot precede
start. Grace values are explicit nonnegative safe integers. Configured rounding
requires a positive safe-integer increment and Down/Up/Nearest direction. Optional
minimum rest is inactive until configured, then requires a nonnegative safe-integer
minute value and Warn/Block mode. Overtime enabled/disabled is an explicit choice;
enabled overtime requires qualification, nonnegative safe-integer cap and explicit
preapproval behavior. Numeric editing accepts whole decimal digits; blank input
never becomes zero. No value is silently truncated or sanitized.

Approval rules require an admitted subject, positive stage through 2,147,483,647,
explicit independence and a closed candidate source. ManagerLevel requires a
positive level through 2,147,483,647; Function requires nonblank text through 120
characters; NamedUser requires an existing tenant account. Duplicate/stage and
mandatory independent-manager restrictions remain in the universal contract.
The current named-account picker consumes the existing Identity account API and
its independent read permission, projecting only ID/name into the control. Denial
is explicit and does not enable free-text account IDs. Existing loaded references
remain distinguishable when outside the current search page.

These editor integrations do not establish full application acceptance. Leave
impact, override command/approval acceptance and browser journeys remain required by the FDD before
catalogue availability changes to Complete.

## ASSIGNMENT-REVIEW-AND-INSPECTION

The unreleased schedule/policy assignment commands complete their review contract
with `previewId` and a 64-character lowercase SHA-256 `digest`. The original closed
assignment fields are the input to
`POST /api/v1/attendance/{schedule-assignments|policy-assignments}/preview`, protected
by current `hcm.attendance.work-schedules.preview` and the complete dated scope.
The caller supplies a stable UUID idempotency key. The API evaluates the explicit
bounded resolution window and coverage boundaries with the existing SQL constraints,
period fences, selection and exact resolver. A transaction savepoint rolls back
all proposed coverage, including predecessor shortening. Preview creates no durable
assignment, workday or outbox intent. Existing Attendance command receipts retain
the actor-bound result, source reference and encrypted reason; no new infrastructure
framework or persistence owner is introduced.

The result contains preview identity, digest, 15-minute expiry, affected employment
and date-check counts, resolvable workdays and unavailable workdays. It binds the
source, parsed command, dated Workforce facts, all selected family inputs, period
evidence and resolution results. Commit rechecks current manage authority, actor,
exact input hash, expiry and the recomputed digest under the tenant write lock.
Only then can coverage, receipt, audit and exact workday intents commit together.
Missing prerequisites remain explicit; time conflicts and locked periods reject
review or commit. The review does not yet claim Leave calculation impact or future
dates outside its explicit execution window. Those full-FDD requirements remain
delivery work. The native assignment form clears review eligibility on every edit,
protects dirty navigation, and retains an uncertain submission's retry identity.

`GET /api/v1/attendance/workdays` accepts only required `employmentId`, `from` and
`to`, with one value each and at most 366 inclusive dates. It returns a server-owned
date-ascending `{items,nextCursor:null}` projection. Current Work Schedules read
authority must cover every dated subject through one complete grant before any
row/count is returned. Each date is Published or explicitly Unavailable, including
pending/failed resolution and missing materialization. Published rows expose exact
stored revision, source versions, timezone, start-date ownership, source-local and
UTC intervals, offset seconds, exact elapsed-millisecond strings and safe rest
evidence. Narrative receipt data and persistence rows are never returned. The native
ObjectPage inspector requires explicit employment and range and never resolves or
queues work as a side effect of reading.

## DATED-SOURCE-INTEGRATION

Forward migrations 50 and 51 materialize the approved Attendance-owned roster,
entry and override sources and their typed immutable workday references. Roster
entry lifecycle derives from its parent. A published roster cannot change its
payload or children; an approved override retains its exact prior workday basis,
zone and intervals. Tenant-composite references bind employment, work date,
source version and creator. Forced RLS and restricted runtime grants apply to
every new table. Publication takes the existing monthly and dated-employment
fences; locked dates cannot acquire ordinary new workday revisions.

The private dated-pattern projection normalizes one actual date for the existing
exact interval/rest resolver. It is not a public ScheduleVersion DTO and does not
create a synthetic schedule row. Approved override precedes published roster;
only absent dated sources fall through to the ordinary seven-scope selector.
Equal winning precedence is unavailable. Roster shifts retain their actual shift
version, timezone mode and rest rule. Custom overrides retain the exact prior
workday's schedule-side rule; the current dated Attendance policy rule still
applies independently. Previous-shift rest search uses the same dated precedence.
Missing Workforce, current shift, calendar or policy facts remain unavailable.

Immutable workdays now store typed shift/roster-entry/override references in
addition to their applicable schedule reference. Existing ordinary workday digests
and intervals are preserved. A nonworking override is explicitly classified as
`NonWorkingOverride`; it is never presented as missing configuration. Inspection
adds safe dated source references and the source revision captured by the workday
receipt, without returning private override reasons. Internal roster publication
commands and override approval/command producers still require delivery; disposable
SQL fixtures prove storage/resolution only, not production approval acceptance.

## OVERRIDE-DRAFT-AND-REVIEW

The admitted override draft and preview routes now reuse Attendance transactions,
command receipts, period fences and the exact dated resolver. The additive
`GET /api/v1/attendance/overrides/{id}` route supplies a safe reload representation
under current `hcm.attendance.work-schedules.read` and the complete dated subject
scope. It accepts no query fields. Its response contains ID, revision, lifecycle,
employment/date, prior workday revision, zone and configured intervals; reasons and
evidence identities are excluded. Creation uses `manage`; review uses `preview`.
Each command requires a trusted write origin and actor-bound UUID retry key.

The draft parser requires all declared fields. IDs are opaque validated identities;
work date is an ISO calendar date and workday revision is a positive integer. Zone
is a validated named timezone of at most 100 characters. Reason is nonblank text
of at most 2,000 characters, preserved exactly. Evidence IDs are explicit and
unique. Segments reuse the universal exact wall-time, contiguous-shift, day-offset,
break and independent overlap-choice restrictions. Explicit `[]` means nonworking;
a missing segments field is invalid. Supplied evidence is rejected as unavailable
until Documents' purpose-bound admission adapter is delivered; no arbitrary ID is
silently accepted or discarded.

Migration 52 adds a typed override reference to existing immutable Attendance
receipts and keeps their at-most-one-source invariant. Reasons use the existing
row-bound cipher. Creation checks the latest stored workday under monthly,
dated-source and workday fences; current whole-grant scope covers all actual dated
assignment dimensions. No stored workday changes. Review temporarily evaluates
Approved selection in an always-rolled-back savepoint, retaining Draft state and
creating no workday or outbox row. Its actor-bound result expires after 15 minutes
and binds source, exact prior workday revision, period, policy and resolution.
It reports exact scheduled/expected milliseconds and whether policy has an
Override approval route. This is dated resolution review only; Leave and subsequent
workday impact, evidence upload/admission, submit/approval and native override UI
remain acceptance requirements.

The pure source decision evaluator implements the existing Attendance ApprovalCase
state model: current source authority and candidates, session/revision/generation
checks, configured independence/distinct actors, all required slots in each stage,
and rejection terminating the case. It does not provide a persistence adapter,
Workflow dispatch or an authorized HTTP decision route. No Workflow task or static
candidate snapshot can manufacture source authority.
