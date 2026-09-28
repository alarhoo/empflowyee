# Workflow Definitions — technical design

Status: approved technical design, 2026-09-28, following the approved [FDD](FDD.md)
and [product-owner delegation](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation
is planned. The owning [workflow TDD](../../domains/workflow/TECHNICAL-DESIGN.md),
[shared TDD](../../architecture/TDD-HCM-3-COMMON.md) and
[SQL/integration TDD](../../architecture/TDD-HCM-3-DATA-MODEL.md) are normative parts
of this design; the blueprint binds their exact reviewed revisions.

## ROUTE

App `WORKFLOW_DEFINITIONS`, owner `workflow`, route `/workflow/workflow-definitions`. Child routes: base list, `/:id` selected detail, `/new` draft create, `/:id/edit` draft edit.
Route IDs are opaque resource IDs (dayId for attendance day, taskId for inbox,
caseId for approval, configuration rootId plus version query for configuration).
Where no single-resource GET is listed, selected detail reloads the collection
with exact `id` filter and requires exactly one authorized row; otherwise 404.
The feature lazy loads from `libs/hcm/web/workflow/feature-workflow-definitions`. Discovery permission
`hcm.catalogue.WORKFLOW_DEFINITIONS.discover` reveals navigation only; every API uses
business authorization. Unavailable dependencies render an honest state.

## FLOORPLAN

`UX-FP-FCL` / `NATIVE`. Native FlexibleColumnLayout, HcmDynamicPage list in begin column and HcmObjectPage detail in middle; each column owns its page header. Complex create/edit stays on the dedicated draft route where declared; focused decision/reason uses a native Dialog.
No custom CSS or theme logic. Detail title uses Close and Maximize/Minimize; native
responsive layout shows one active column on narrow screens and restores list
focus on close. Important data: Registered subject contract/actions/facts, definition/version, stages/slots/routes/conditions/timers, impact counts.
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
Business DTO fields are defined in [DOMAIN SCHEMAS](../../domains/workflow/TECHNICAL-DESIGN.md#schemas)
and its supplements. Read representations of Draft DTOs add id/revision/state;
PATCH is whole-draft replacement, not an arbitrary JSON patch. Lists are envelope
`{items,nextCursor,total?}`, with scope-filtered total only. `CommandResult`
contains id/revision/state and async operationId/statusUrl when applicable.

| Method | Exact route                                                    | Request schema                     | Response schema       | Business permission                         |
| ------ | -------------------------------------------------------------- | ---------------------------------- | --------------------- | ------------------------------------------- |
| GET    | `/api/v1/workflow/definitions`                                 | Query                              | DefinitionDraft[]     | `hcm.workflow.workflow-definitions.read`    |
| POST   | `/api/v1/workflow/definitions`                                 | DefinitionDraft                    | DefinitionDraft       | `hcm.workflow.workflow-definitions.draft`   |
| POST   | `/api/v1/workflow/definitions/{id}/versions`                   | VersionDraftCommand                | DefinitionDraft       | `hcm.workflow.workflow-definitions.draft`   |
| GET    | `/api/v1/workflow/definitions/{id}/versions/{version}`         | Query                              | DefinitionDraft       | `hcm.workflow.workflow-definitions.read`    |
| PATCH  | `/api/v1/workflow/definitions/{id}/versions/{version}`         | DefinitionDraft + expectedRevision | DefinitionDraft       | `hcm.workflow.workflow-definitions.draft`   |
| POST   | `/api/v1/workflow/definitions/{id}/versions/{version}/preview` | DefinitionPreview                  | Preview               | `hcm.workflow.workflow-definitions.preview` |
| POST   | `/api/v1/workflow/definitions/{id}/versions/{version}/publish` | PublishCommand                     | CommandResult         | `hcm.workflow.workflow-definitions.publish` |
| POST   | `/api/v1/workflow/definitions/{id}/versions/{version}/retire`  | ReasonCommand                      | CommandResult         | `hcm.workflow.workflow-definitions.retire`  |
| GET    | `/api/v1/workflow/subject-contracts`                           | Query                              | SubjectContractView[] | `hcm.workflow.workflow-definitions.read`    |

Every response has a purpose-built projection; private narrative/evidence requires
additional current field permission. No persistence row serialization. Disabled
encashment/device/pool/delegation/payment routes are absent, not successful stubs.

## AUTHORIZATION

Entitlement `hcm.workflow` and each endpoint's explicit
operation permission are both required. Logical access functions
`WORKFLOW_DEFINITION_ADMINISTRATION` map to the enumerated operation grants,
never a role-name bypass. Seed only the relevant actions for the actor described
by the FDD: Workflow definition administrator and verified publisher. Scope is one current grant covering the selected organizational/employment scope. Publish/decide/recover/lock/reopen/on-behalf
are distinct operation grants where listed. A read grant cannot imply them.
Workflow additionally checks source module entitlement and source decision grant
on every row/action. No combining partial scope grants, trusting UI visibility,
or relying on assignment/reporting as permission. Fresh session and source/task/
subject revisions are rechecked in the transaction; reasons and audit are retained.
Independent source slots cannot be satisfied by maker/beneficiary. No step-up
infrastructure or delegation creation is required/introduced in this release.

## DATA

Owning tables/read projections: workflow registry and definition/version/stage/task/condition/routing/escalation/preview families.
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
Background dependencies: registered source manifests, authority/session validity and preview worker.
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

| Project                                         | Root                                                 | Tags                                                                   |
| ----------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `hcm-workflow-contract`                         | `libs/hcm/contracts/workflow`                        | `product:hcm`, `runtime:universal`, `domain:workflow`, `type:contract` |
| `hcm-web-workflow-data-access`                  | `libs/hcm/web/workflow/data-access`                  | `product:hcm`, `runtime:web`, `domain:workflow`, `type:data-access`    |
| `hcm-web-workflow-feature-workflow-definitions` | `libs/hcm/web/workflow/feature-workflow-definitions` | `product:hcm`, `runtime:web`, `domain:workflow`, `type:feature`        |
| `hcm-api-workflow-domain`                       | `libs/hcm/api/workflow/domain`                       | `product:hcm`, `runtime:api`, `domain:workflow`, `type:domain`         |
| `hcm-api-workflow-application`                  | `libs/hcm/api/workflow/application`                  | `product:hcm`, `runtime:api`, `domain:workflow`, `type:application`    |
| `hcm-api-workflow-infrastructure`               | `libs/hcm/api/workflow/infrastructure`               | `product:hcm`, `runtime:api`, `domain:workflow`, `type:infrastructure` |
| `hcm-api-workflow-transport`                    | `libs/hcm/api/workflow/transport`                    | `product:hcm`, `runtime:api`, `domain:workflow`, `type:transport`      |
| `hcm-api-workflow-module`                       | `libs/hcm/api/workflow/module`                       | `product:hcm`, `runtime:api`, `domain:workflow`, `type:module`         |

## VERIFICATION

All test IDs in [traceability](TRACEABILITY.md) are planned acceptance cases, not
executed-test claims. Use real PostgreSQL/HTTP for tenant/concurrency/receipt
invariants, contract tests for DTO projections and pure unit tests for algorithms.
Production-app browser checks cover keyboard, narrow/desktop layout, native action
behavior, focus, validation, empty/error/retry and stale response clearing. Include
the owning domain's boundary suite. Design/readiness checks alone do not approve
the implemented app or floorplan.

## DESIGN-001

Requirement [REQ-WORKFLOW-DEFINITIONS-001](FDD.md#req-workflow-definitions-001). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Scripts/arbitrary URLs/unregistered actions or incompatible facts are rejected; the definition cannot weaken source required slots.

## DESIGN-002

Requirement [REQ-WORKFLOW-DEFINITIONS-002](FDD.md#req-workflow-definitions-002). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Preview mutates no source case; source or draft changes invalidate its digest.

## DESIGN-003

Requirement [REQ-WORKFLOW-DEFINITIONS-003](FDD.md#req-workflow-definitions-003). Implement the API schemas and owning domain ALGORITHM for this requirement. Recheck source revisions and authorization at the commit boundary; use the release-specific guards and no disabled adapters.
Acceptance target: Published children cannot be edited; existing instances retain their accepted graph/manifest and retired versions stop future selection.

## DESIGN-004

Requirement [REQ-WORKFLOW-DEFINITIONS-004](FDD.md#req-workflow-definitions-004). Apply every API permission and exact current scope before row lookup/count or mutation. Exercise tenant and grant revocation in real SQL transactions, including a second own employment.
Acceptance target: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

## DESIGN-005

Requirement [REQ-WORKFLOW-DEFINITIONS-005](FDD.md#req-workflow-definitions-005). Use the selected native floorplan and semantic controls, cancel stale queries on context change and keep explicit error/empty/unavailable states. Verify focus and keyboard after every action.
Acceptance target: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

## DESIGN-006

Requirement [REQ-WORKFLOW-DEFINITIONS-006](FDD.md#req-workflow-definitions-006). Enforce the DATA and CONSISTENCY transaction boundaries; inject failure before/after commit and replay the same key. Read-only surfaces expose no write route.
Acceptance target: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## DELIVERY

Branch `codex/hcm-3-workflow-definitions`. Prerequisite foundations must be merged before app
delivery; follow the [ordered foundation plan](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#order).
Planned coherent commits:

1. `feat(hcm-workflow): add workflow-definitions contracts and domain behavior`
2. `feat(hcm-workflow): persist workflow-definitions with authorization and receipts`
3. `feat(hcm-workflow): add workflow-definitions native application experience`
4. `test(hcm-workflow): verify workflow-definitions acceptance and document evidence`

Omit persistence mutations for read-only slices; reuse admitted domain foundation
work rather than duplicate tables. PR CI never deploys. No implementation occurs
as part of this Step-1 design package.
