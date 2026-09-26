# HR Service Desk — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/employee/hr-service-desk`; lazy feature `libs/hcm/web/employee/feature-hr-service-desk` (`hcm-web-employee-feature-hr-service-desk`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

Queue queries join the current assignee and the earliest running target. SLA state is computed from stored targets and the approved calendar at read time.

Query behavior: Server mode. Views assigned, teams, all; filters status, priority, typeId, slaState; q matches request number and subject; sort next due then id.

## API

All DTOs and validation belong to `hcm-employee-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/employee/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/employee`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                                                           | Permission                          | Request                                                                  | Response                         |
| ------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------ | -------------------------------- |
| `GET /hr-service/requests`                                          | `hcm.employee.hr-service.handle`    | List query: view?, status?, priority?, typeId?, slaState?                | Page<HrServiceRequestSummaryDto> |
| `GET /hr-service/requests/{id}`                                     | `hcm.employee.hr-service.handle`    | None                                                                     | HrServiceRequestDto              |
| `GET /hr-service/requests/{id}/messages`                            | `hcm.employee.hr-service.handle`    | List query                                                               | Page<HrServiceMessageDto>        |
| `POST /hr-service/requests`                                         | `hcm.employee.hr-service.handle`    | {subjectWorkerId, typeId, priority, subject, description, reason}        | HrServiceRequestDto              |
| `POST /hr-service/requests/{id}/messages`                           | `hcm.employee.hr-service.handle`    | multipart: metadata {visibility, body, expectedRevision}, file?          | HrServiceRequestDto              |
| `POST /hr-service/requests/{id}/assignment`                         | `hcm.employee.hr-service.handle`    | {teamId, assigneeAccountId?, reason, expectedRevision}                   | HrServiceRequestDto              |
| `POST /hr-service/requests/{id}/status`                             | `hcm.employee.hr-service.handle`    | {status, resolutionCode?, resolutionSummary?, reason?, expectedRevision} | HrServiceRequestDto              |
| `GET /hr-service/requests/{id}/attachments/{attachmentId}/download` | `hcm.employee.hr-service.handle`    | None                                                                     | Attachment bytes                 |
| `GET /hr-service/configuration/{kind}`                              | `hcm.employee.hr-service.configure` | List query                                                               | Page<HrServiceConfigDto>         |
| `POST /hr-service/configuration/{kind}`                             | `hcm.employee.hr-service.configure` | {configuration fields, reason}                                           | HrServiceConfigDto               |
| `PUT /hr-service/configuration/{kind}/{id}`                         | `hcm.employee.hr-service.configure` | {configuration fields, expectedRevision, reason}                         | HrServiceConfigDto               |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Every status change updates targets (start, pause, resume, met, breached) in the same transaction and records a StatusUpdate system message. Attachments reuse the approved HCM-1 file types and limits.

## RULES

Internal visibility is deny-by-default: self serializers select only EmployeeVisible rows. Seeded service level policy `standard@1` implements DEC-HCM2-004: 24x7 clock; FirstResponse and Resolution targets per priority; pause while WaitingForEmployee; 7-day reopen window. Breach is derived at read time and persisted on the next write, because no background runtime exists. Request numbers come from a per-tenant sequence.

Domain invariants are in the [domain policy](../../domains/employee/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/employee/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.employee`. Discovery stays `hcm.catalogue.HR_SERVICE_DESK.discover` and is not a business permission.

| Business permission                 | Authorized function                                                   |
| ----------------------------------- | --------------------------------------------------------------------- |
| `hcm.employee.hr-service.handle`    | Read and work tenant service requests including internal content      |
| `hcm.employee.hr-service.configure` | Maintain teams, memberships, request types and service level policies |

Subject scope: Tenant scope for requests of types the actor’s entitlements allow. `kind` is teams, memberships, request-types or service-levels. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model             | Owner     | Use                                     |
| ------------------------------- | --------- | --------------------------------------- |
| `hr_service_team`               | employee  | owned                                   |
| `hr_service_team_membership`    | employee  | owned                                   |
| `hr_service_request_type`       | employee  | owned                                   |
| `hr_service_level_policy`       | employee  | owned                                   |
| `hr_service_request`            | employee  | owned                                   |
| `hr_service_request_message`    | employee  | owned                                   |
| `hr_service_request_attachment` | employee  | owned                                   |
| `hr_service_request_assignee`   | employee  | owned                                   |
| `hr_service_level_target`       | employee  | owned                                   |
| `document_blob`                 | documents | attachments through DocumentStoragePort |
| `employee_command_receipt`      | employee  | idempotency receipts                    |
| `audit_event`                   | audit     | append through the audit port           |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin: `HcmDynamicPage` with a SegmentedButton view (Assigned to me, My teams, All, Configuration), filters and table. Mid: `HcmObjectPage` with Conversation (UI5 Timeline plus reply and note composers), Details, Service levels, Assignment history and Attachments; or a configuration Object Page. Assign, status changes and configuration edits use Dialogs.

Semantic controls: Status, priority and SLA state use inverted ObjectStatus (Breached is Negative, due soon Critical). Internal notes are labelled with an Information ObjectStatus. Composer uses UI5 TextArea and FileUploader. Team, agent and type pickers use UI5 ComboBox. Durations in configuration use UI5 StepInput with minutes.

Table declaration: Queue: mode **server**, 25 per page, growing, whole-row navigation. Messages: server, 50 per page, oldest first with growing.

Forms: Signal Forms per dialog and composer; sending clears the draft only after success.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader, Timeline, TimelineItem, ViewSettingsDialog                                                                                                                                                                                                              |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, SegmentedButton, SegmentedButtonItem, Input, TextArea, Select, Option, ComboBox, ComboBoxItem, StepInput, CheckBox, FileUploader, Link |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                                                                                                                           |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                    | Root                                            | Tags                                                                   |
| ------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `hcm-web-employee-feature-hr-service-desk` | `libs/hcm/web/employee/feature-hr-service-desk` | `product:hcm`, `runtime:web`, `domain:employee`, `type:feature`        |
| `hcm-web-employee-data-access`             | `libs/hcm/web/employee/data-access`             | `product:hcm`, `runtime:web`, `domain:employee`, `type:data-access`    |
| `hcm-employee-contract`                    | `libs/hcm/contracts/employee`                   | `product:hcm`, `runtime:universal`, `domain:employee`, `type:contract` |
| `hcm-api-employee-domain`                  | `libs/hcm/api/employee/domain`                  | `product:hcm`, `runtime:api`, `domain:employee`, `type:domain`         |
| `hcm-api-employee-application`             | `libs/hcm/api/employee/application`             | `product:hcm`, `runtime:api`, `domain:employee`, `type:application`    |
| `hcm-api-employee-infrastructure`          | `libs/hcm/api/employee/infrastructure`          | `product:hcm`, `runtime:api`, `domain:employee`, `type:infrastructure` |
| `hcm-api-employee-transport`               | `libs/hcm/api/employee/transport`               | `product:hcm`, `runtime:api`, `domain:employee`, `type:transport`      |
| `hcm-api-employee-module`                  | `libs/hcm/api/employee/module`                  | `product:hcm`, `runtime:api`, `domain:employee`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Workforce people foundation; documents storage; notification event registration; migration `000028`.

| Prerequisite               | State    | Note                                     |
| -------------------------- | -------- | ---------------------------------------- |
| `hcm2-shared-contract`     | resolved | Shared HCM-2 design complete for review. |
| `hcm2-physical-model`      | resolved | Shared HCM-2 design complete for review. |
| `hcm2-permission-register` | resolved | Shared HCM-2 design complete for review. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`employee.operations@1` seeds one HR team, request types and a service level policy shaped by DEC-HCM2-004, with no fictional conversations. `access.hcm2@1` grants handle and configure to Toby. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-hr-service-desk`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-employee): add HR service contracts and persistence`
- `feat(hcm-employee): expose authorized HR service desk API`
- `feat(hcm-employee): add HR service desk native UI`
- `test(hcm-employee): verify HR service desk acceptance`
