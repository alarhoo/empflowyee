# Leave Administration — technical design

Status: approved technical design, 2026-09-28, following the approved [FDD](FDD.md)
and [product-owner delegation](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation
is planned. The owning [leave TDD](../../domains/leave/TECHNICAL-DESIGN.md),
[shared TDD](../../architecture/TDD-HCM-3-COMMON.md) and
[SQL/integration TDD](../../architecture/TDD-HCM-3-DATA-MODEL.md) are normative parts
of this design; the blueprint binds their exact reviewed revisions.

## ROUTE

App `LEAVE_ADMINISTRATION`, owner `leave`, route `/leave/leave-administration`. Child routes: base list, `/:id` selected detail.
Route IDs are opaque resource IDs (dayId for attendance day, taskId for inbox,
caseId for approval, configuration rootId plus version query for configuration).
Where no single-resource GET is listed, selected detail reloads the collection
with exact `id` filter and requires exactly one authorized row; otherwise 404.
The feature lazy loads from `libs/hcm/web/leave/feature-leave-administration`. Discovery permission
`hcm.catalogue.LEAVE_ADMINISTRATION.discover` reveals navigation only; every API uses
business authorization. Unavailable dependencies render an honest state.

## FLOORPLAN

`UX-FP-FCL` / `NATIVE`. Native FlexibleColumnLayout, HcmDynamicPage list in begin column and HcmObjectPage detail in middle; each column owns its page header. Complex create/edit stays on the dedicated draft route where declared; focused decision/reason uses a native Dialog.
No custom CSS or theme logic. Detail title uses Close and Maximize/Minimize; native
responsive layout shows one active column on narrow screens and restores list
focus on close. Important data: Employment/enrollment, policy/period, request and account summaries, ledger/allocations, run items, adjustment case and exception details by permission.
Semantic fields use ObjectStatus for state, DatePicker/TimePicker for local time,
DateTimePicker for corrected instants, Select/ComboBox for authorized IDs/enums,
TextArea for reasons and FileUploader for governed evidence. Numeric unit/time
formatters preserve decimal/exact values with explicit units and timezone labels.
Signal Forms applies common and owning DTO validators on input and submit; published payloads are read-only. Source field errors remain attached to controls and summary.
Table ownership is server-side. Allowlisted sort keys: `state, id`; fields absent
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
Business DTO fields are defined in [DOMAIN SCHEMAS](../../domains/leave/TECHNICAL-DESIGN.md#schemas)
and its supplements. Read representations of Draft DTOs add id/revision/state;
PATCH is whole-draft replacement, not an arbitrary JSON patch. Lists are envelope
`{items,nextCursor,total?}`, with scope-filtered total only. `CommandResult`
contains id/revision/state and async operationId/statusUrl when applicable.

| Method | Exact route                                | Request schema    | Response schema  | Business permission                      |
| ------ | ------------------------------------------ | ----------------- | ---------------- | ---------------------------------------- |
| GET    | `/api/v1/leave/administration/enrollments` | Query             | EnrollmentView[] | `hcm.leave.leave-administration.read`    |
| GET    | `/api/v1/leave/administration/requests`    | Query             | RequestView[]    | `hcm.leave.leave-administration.read`    |
| GET    | `/api/v1/leave/administration/accounts`    | Query             | BalanceView[]    | `hcm.leave.leave-administration.read`    |
| GET    | `/api/v1/leave/administration/runs`        | Query             | OperationView[]  | `hcm.leave.leave-administration.read`    |
| GET    | `/api/v1/leave/administration/exceptions`  | Query             | OperationView[]  | `hcm.leave.leave-administration.read`    |
| POST   | `/api/v1/leave/enrollments`                | EnrollmentCommand | CommandResult    | `hcm.leave.leave-administration.manage`  |
| POST   | `/api/v1/leave/accrual-runs`               | AccrualCommand    | OperationView    | `hcm.leave.leave-administration.run`     |
| POST   | `/api/v1/leave/adjustment-previews`        | AdjustmentInput   | Preview          | `hcm.leave.leave-administration.preview` |
| POST   | `/api/v1/leave/adjustments`                | AdjustmentDraft   | CommandResult    | `hcm.leave.leave-administration.manage`  |
| POST   | `/api/v1/leave/runs/{id}/retry`            | RecoveryCommand   | OperationView    | `hcm.leave.leave-administration.recover` |
| POST   | `/api/v1/leave/periods/{id}/close-preview` | ReasonCommand     | Preview          | `hcm.leave.leave-administration.preview` |
| POST   | `/api/v1/leave/periods/{id}/close`         | PeriodCommand     | CommandResult    | `hcm.leave.leave-administration.close`   |

Every response has a purpose-built projection; private narrative/evidence requires
additional current field permission. No persistence row serialization. Disabled
encashment/device/pool/delegation/payment routes are absent, not successful stubs.

## AUTHORIZATION

Entitlement `hcm.leave` and each endpoint's explicit
operation permission are both required. Logical access functions
`LEAVE_OPERATIONS_MANAGE` map to the enumerated operation grants,
never a role-name bypass. Seed only the relevant actions for the actor described
by the FDD: Leave administrator; independent approver for balance adjustments. Scope is one current grant covering the selected organizational/employment scope. Publish/decide/recover/lock/reopen/on-behalf
are distinct operation grants where listed. A read grant cannot imply them.
Workflow additionally checks source module entitlement and source decision grant
on every row/action. No combining partial scope grants, trusting UI visibility,
or relying on assignment/reporting as permission. Fresh session and source/task/
subject revisions are rechecked in the transaction; reasons and audit are retained.
Independent source slots cannot be satisfied by maker/beneficiary. No step-up
infrastructure or delegation creation is required/introduced in this release.

## DATA

### Enrollment admission and persistence

The enrollment command accepts only employmentId, policyVersionId, effectiveFrom,
optional effectiveTo and a required preserved reason of at most 2000 characters.
IDs use the common 200-character limit and dates are valid ordered ISO local dates.
No account, quantity, tenant or actor override is accepted. The command authorizes
the whole dated employment under one current grant before reading its owner facts.

An explicit tenant Leave period contains the admission range; absence is unavailable,
not an inferred financial/calendar year. Periods are nonoverlapping, revisioned
Planned/Open/Closing/Closed records. Period dates are immutable after creation.
The initial local period dates need product configuration before seed admission.
Ordinary runtime persistence has no period lifecycle command until reconciled
close and explicit configuration paths exist.

Eligibility evaluates published-version range and configured base worker-type,
legal-entity and service constraints, then the exact dated employment assignment,
then typed rules by descending numeric priority. Empty base selector lists impose
no filter but grant no inclusion: an assignment or typed Include must match.
At equal priority Exclude wins. Assignment dimensions must match one actual dated
assignment; two assignments cannot be pooled. Missing facts that can alter the
winning outcome return Unavailable, including an unknown gender predicate.
Unknown statutory-floor references remain unavailable and cannot be overridden.
Service days use completed local calendar days from the known continuous-service
start, or the actual hire date when that optional date is absent.

Enrollment stores the immutable policy, period, employment, mode/unit and bounded
inclusive effective range. Policy/period revisions and dated Workforce digests
form the encrypted, row-bound eligibility snapshot and canonical digest. Read
DTOs omit that private snapshot. Same-employment/same-policy enrollment ranges
cannot overlap, including retained ended history; re-evaluation creates a new
effective enrollment rather than replacing its policy version. Admission locks
the period before the policy and rechecks their revisions and admission states.

An active Balance enrollment and its zero-funded account commit together using
a deferred database constraint. A tenant/mode/unit composite reference prohibits
Unpaid accounts. Account creation cannot inject an opening quantity, last posting
or advanced revision. Entitlements require the separately governed grant/accrual
command; a created account alone is not a funded or completed enrollment journey.
Runtime lifecycle and quantity mutation privileges remain withheld until the
corresponding obligation/ledger commands are installed.

The grant ledger adapter is an internal port for already-authorized source
commands, not a public funding API. Each positive exact grant retains its
enrollment/unit, grant type, effective/expiry dates, original actor, source
reference, input digest and business key. A grant and exactly one matching
posting must commit together. The posting quantity, date, unit, actor and digest
must equal the source. Period-before-account locks serialize close, retry and
sequence allocation; database triggers compute sequence/running quantity and
update the account projection from the immutable ledger. Direct projection
edits cannot create entitlement. Same-key replay returns the original result;
changed input conflicts. Grant/transaction rows deny update/delete, including
through owner SQL. Accrual, reservation, debit, cancellation and adjustment
effects require their own typed source references before their transaction kinds
are admitted; the first ledger migration supports Grant only. Worker attribution
is not replaced with a fabricated human account.

Technical review, 2026-10-03, under the existing finalization delegation: this
mapping preserves Business Rules 2, 4, 6, 24 and 28, the published-version-first
eligibility order and the Unpaid exception. No period dates, entitlement amounts,
statutory source, authorization or opening grant are supplied as implicit defaults.

Owning tables/read projections: enrollment, account/ledger/reservation/allocation, accrual runs/items, adjustment, leave period/case/slot.
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
Background dependencies: Leave policy/ledger/approval/worker foundation.
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

| Project                                      | Root                                              | Tags                                                                |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| `hcm-leave-contract`                         | `libs/hcm/contracts/leave`                        | `product:hcm`, `runtime:universal`, `domain:leave`, `type:contract` |
| `hcm-web-leave-data-access`                  | `libs/hcm/web/leave/data-access`                  | `product:hcm`, `runtime:web`, `domain:leave`, `type:data-access`    |
| `hcm-web-leave-feature-leave-administration` | `libs/hcm/web/leave/feature-leave-administration` | `product:hcm`, `runtime:web`, `domain:leave`, `type:feature`        |
| `hcm-api-leave-domain`                       | `libs/hcm/api/leave/domain`                       | `product:hcm`, `runtime:api`, `domain:leave`, `type:domain`         |
| `hcm-api-leave-application`                  | `libs/hcm/api/leave/application`                  | `product:hcm`, `runtime:api`, `domain:leave`, `type:application`    |
| `hcm-api-leave-infrastructure`               | `libs/hcm/api/leave/infrastructure`               | `product:hcm`, `runtime:api`, `domain:leave`, `type:infrastructure` |
| `hcm-api-leave-transport`                    | `libs/hcm/api/leave/transport`                    | `product:hcm`, `runtime:api`, `domain:leave`, `type:transport`      |
| `hcm-api-leave-module`                       | `libs/hcm/api/leave/module`                       | `product:hcm`, `runtime:api`, `domain:leave`, `type:module`         |

## VERIFICATION

All test IDs in [traceability](TRACEABILITY.md) are planned acceptance cases, not
executed-test claims. Use real PostgreSQL/HTTP for tenant/concurrency/receipt
invariants, contract tests for DTO projections and pure unit tests for algorithms.
Production-app browser checks cover keyboard, narrow/desktop layout, native action
behavior, focus, validation, empty/error/retry and stale response clearing. Include
the owning domain's boundary suite. Design/readiness checks alone do not approve
the implemented app or floorplan.

## DESIGN-001

Requirement [REQ-LEAVE-ADMINISTRATION-001](FDD.md#req-leave-administration-001). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Incomplete/out-of-scope employment is denied; concurrent employments retain separate accounts and history.

## DESIGN-002

Requirement [REQ-LEAVE-ADMINISTRATION-002](FDD.md#req-leave-administration-002). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Same enrollment/rule/date posts once; failed items stay visible and run status is derived from actual outcomes.

## DESIGN-003

Requirement [REQ-LEAVE-ADMINISTRATION-003](FDD.md#req-leave-administration-003). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Maker cannot approve; a correction appends an adjustment/reversal and never updates a prior ledger row.

## DESIGN-004

Requirement [REQ-LEAVE-ADMINISTRATION-004](FDD.md#req-leave-administration-004). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Unresolved reservations/failures block close; late correction never edits a closed period.

## DESIGN-005

Requirement [REQ-LEAVE-ADMINISTRATION-005](FDD.md#req-leave-administration-005). Apply every API permission and exact current scope before row lookup/count or mutation. Exercise tenant and grant revocation in real SQL transactions, including a second own employment.
Acceptance target: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

## DESIGN-006

Requirement [REQ-LEAVE-ADMINISTRATION-006](FDD.md#req-leave-administration-006). Use the selected native floorplan and semantic controls, cancel stale queries on context change and keep explicit error/empty/unavailable states. Verify focus and keyboard after every action.
Acceptance target: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

## DESIGN-007

Requirement [REQ-LEAVE-ADMINISTRATION-007](FDD.md#req-leave-administration-007). Enforce the DATA and CONSISTENCY transaction boundaries; inject failure before/after commit and replay the same key. Read-only surfaces expose no write route.
Acceptance target: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## DELIVERY

Branch `codex/hcm-3-leave-administration`. Prerequisite foundations must be merged before app
delivery; follow the [ordered foundation plan](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#order).
Planned coherent commits:

1. `feat(hcm-leave): add leave-administration contracts and domain behavior`
2. `feat(hcm-leave): persist leave-administration with authorization and receipts`
3. `feat(hcm-leave): add leave-administration native application experience`
4. `test(hcm-leave): verify leave-administration acceptance and document evidence`

Omit persistence mutations for read-only slices; reuse admitted domain foundation
work rather than duplicate tables. PR CI never deploys. No implementation occurs
as part of this Step-1 design package.
