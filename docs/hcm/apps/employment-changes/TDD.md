# Employment Changes — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/employee/employment-changes`; lazy feature `libs/hcm/web/employee/feature-employment-changes` (`hcm-web-employee-feature-employment-changes`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

The change context endpoint returns current employment and assignment facts with revisions, so the request records expected revisions. Detail shows execution steps with safe failure codes.

Query behavior: Server mode. View all, mine or awaiting my decision; filters changeType, status, effective date range; sort effective date or created time, then id.

## API

All DTOs and validation belong to `hcm-employee-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/employee/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/employee`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                         | Permission                     | Request                                                                                                                    | Response                         |
| --------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `GET /changes`                    | `hcm.employee.changes.read`    | List query: view?, changeType?, status?, from?, to?                                                                        | Page<EmploymentChangeSummaryDto> |
| `GET /changes/{id}`               | `hcm.employee.changes.read`    | None                                                                                                                       | EmploymentChangeRequestDto       |
| `GET /changes/context/{workerId}` | `hcm.employee.changes.request` | None                                                                                                                       | WorkerChangeContextDto           |
| `GET /changes/options/{kind}`     | `hcm.employee.changes.request` | List query: q                                                                                                              | Page<StructureOptionDto>         |
| `POST /changes`                   | `hcm.employee.changes.request` | {workerId, employmentId?, assignmentId?, changeType, effectiveDate, targets, reasonCode, reasonDetail, evidenceReference?} | EmploymentChangeRequestDto       |
| `PUT /changes/{id}`               | `hcm.employee.changes.request` | {targets, effectiveDate, reasonCode, reasonDetail, expectedRevision}                                                       | EmploymentChangeRequestDto       |
| `POST /changes/{id}/submit`       | `hcm.employee.changes.request` | {expectedRevision}                                                                                                         | EmploymentChangeRequestDto       |
| `POST /changes/{id}/decide`       | `hcm.employee.changes.approve` | {slotCode, decision: Approved\|Rejected, reason, expectedRevision}                                                         | EmploymentChangeRequestDto       |
| `POST /changes/{id}/apply`        | `hcm.employee.changes.request` | {expectedRevision}                                                                                                         | EmploymentChangeRequestDto       |
| `POST /changes/{id}/cancel`       | `hcm.employee.changes.request` | {expectedRevision, reason}                                                                                                 | EmploymentChangeRequestDto       |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Submission snapshots the policy code and version from DEC-HCM2-002 and creates approval slots. Final approval executes immediately when every fact is dated or the effective date is today or earlier; otherwise the request waits for Apply. Execution steps run in one transaction with idempotent step keys.

## RULES

Nonterminal requests on the same employment and date are excluded by constraint. Approval policy `employment-change@1` (DEC-HCM2-002) has one slot for every type, a 30-day backdating limit and 90 days for Correction; the backdating check runs at submission and again at approval. Position capacity uses `PositionReadPort.capacityDecision` (DEC-HCM2-007) and rejects overfill or unknown occupancy. Execution re-resolves current facts after any uncertainty and fails safely on drift.

Domain invariants are in the [domain policy](../../domains/employee/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/employee/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.employee`. Discovery stays `hcm.catalogue.EMPLOYMENT_CHANGES.discover` and is not a business permission.

| Business permission            | Authorized function                                          |
| ------------------------------ | ------------------------------------------------------------ |
| `hcm.employee.changes.read`    | Read employment change requests                              |
| `hcm.employee.changes.request` | Create, edit, submit, apply and cancel requests              |
| `hcm.employee.changes.approve` | Decide approval slots under DEC-HCM2-002; never own requests |

Subject scope: Tenant scope with HR relation for requesters; approvers see requests with a slot they are eligible for. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model               | Owner                | Use                               |
| --------------------------------- | -------------------- | --------------------------------- |
| `workforce_change_request`        | employee             | owned                             |
| `workforce_change_approval`       | employee             | owned                             |
| `workforce_change_execution_step` | employee             | owned                             |
| `employment`                      | workforce-foundation | write through WorkforceFactsPort  |
| `assignment`                      | workforce-foundation | write through WorkforceFactsPort  |
| `reporting_line`                  | workforce-foundation | write through WorkforceFactsPort  |
| `worker_event`                    | workforce-foundation | append through WorkforceFactsPort |
| `position_version`                | job-architecture     | read through PositionReadPort     |
| `employee_command_receipt`        | employee             | idempotency receipts              |
| `audit_event`                     | audit                | append through the audit port     |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin: `HcmDynamicPage` with a SegmentedButton view (All, Mine, Awaiting my decision), filters and table. Mid: `HcmObjectPage` with Overview, Proposed changes, Approvals, Execution and History sections. New request uses the Wizard route `/employee/employment-changes/new` with steps Worker and context, Change type, Details, Review and submit. Approve, Reject, Apply and Cancel use Dialogs.

Semantic controls: Request and slot status use inverted ObjectStatus. Effective date uses UI5 DatePicker bounded by the backdating limit. Change type and reason code use UI5 Select. Structure, position and manager pickers use UI5 ComboBox. FTE and hours use UI5 StepInput. Current versus proposed uses a UI5 Table with Label and Text cells.

Table declaration: Requests: mode **server**, 25 per page, growing, whole-row navigation.

Forms: Signal Forms per wizard step; the Details step renders only the target fields of the chosen type.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader, Wizard, WizardStep, Timeline, TimelineItem, ViewSettingsDialog                                                                                                                                                                        |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, SegmentedButton, SegmentedButtonItem, Input, TextArea, Select, Option, ComboBox, ComboBoxItem, StepInput, DatePicker |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                                                                                                         |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                       | Root                                               | Tags                                                                   |
| --------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| `hcm-web-employee-feature-employment-changes` | `libs/hcm/web/employee/feature-employment-changes` | `product:hcm`, `runtime:web`, `domain:employee`, `type:feature`        |
| `hcm-web-employee-data-access`                | `libs/hcm/web/employee/data-access`                | `product:hcm`, `runtime:web`, `domain:employee`, `type:data-access`    |
| `hcm-employee-contract`                       | `libs/hcm/contracts/employee`                      | `product:hcm`, `runtime:universal`, `domain:employee`, `type:contract` |
| `hcm-api-employee-domain`                     | `libs/hcm/api/employee/domain`                     | `product:hcm`, `runtime:api`, `domain:employee`, `type:domain`         |
| `hcm-api-employee-application`                | `libs/hcm/api/employee/application`                | `product:hcm`, `runtime:api`, `domain:employee`, `type:application`    |
| `hcm-api-employee-infrastructure`             | `libs/hcm/api/employee/infrastructure`             | `product:hcm`, `runtime:api`, `domain:employee`, `type:infrastructure` |
| `hcm-api-employee-transport`                  | `libs/hcm/api/employee/transport`                  | `product:hcm`, `runtime:api`, `domain:employee`, `type:transport`      |
| `hcm-api-employee-module`                     | `libs/hcm/api/employee/module`                     | `product:hcm`, `runtime:api`, `domain:employee`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Workforce employment foundation; Positions foundation; notification event registration; migration `000025`.

| Prerequisite                  | State    | Note                                                                                                                                                                                      |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hcm2-shared-contract`        | resolved | Shared HCM-2 design complete.                                                                                                                                                             |
| `hcm2-physical-model`         | resolved | Shared HCM-2 design complete.                                                                                                                                                             |
| `hcm2-permission-register`    | resolved | Shared HCM-2 design complete.                                                                                                                                                             |
| `wizard-floorplan-acceptance` | resolved | Design resolved. Implemented in its [delivery step](../../roadmap/HCM-2-DESIGN-REVIEW.md#order) before this app ships: Shared HcmWizardPage accepted.                                     |
| `position-read-port`          | resolved | Design resolved. Implemented in its [delivery step](../../roadmap/HCM-2-DESIGN-REVIEW.md#order) before this app ships: Positions foundation provides PositionReadPort capacity decisions. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

No seeded requests or approvals. `access.hcm2@1` grants read to Toby and David, request to Toby and approve to David. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-employment-changes`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-employee): add employment change contracts and persistence`
- `feat(hcm-employee): expose authorized employment change API`
- `feat(hcm-employee): add employment changes native UI`
- `test(hcm-employee): verify employment changes acceptance`
