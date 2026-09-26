# My HR Requests — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/employee/my-hr-requests`; lazy feature `libs/hcm/web/employee/feature-my-hr-requests` (`hcm-web-employee-feature-my-hr-requests`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

Self queries always include the requester predicate and EmployeeVisible visibility. Nonexistent or foreign request IDs return 404.

Query behavior: Server mode, own requests; view open or closed; q matches number and subject; sort last update desc then id.

## API

All DTOs and validation belong to `hcm-employee-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/employee/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/employee`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                                                      | Permission                             | Request                                                   | Response                             |
| -------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------- | ------------------------------------ |
| `GET /me/hr-requests`                                          | `hcm.employee.hr-requests.self.read`   | List query: view?                                         | Page<HrServiceRequestSelfSummaryDto> |
| `GET /me/hr-requests/{id}`                                     | `hcm.employee.hr-requests.self.read`   | None                                                      | HrServiceRequestSelfDto              |
| `GET /me/hr-requests/{id}/messages`                            | `hcm.employee.hr-requests.self.read`   | List query                                                | Page<HrServiceMessageSelfDto>        |
| `GET /me/hr-request-types`                                     | `hcm.employee.hr-requests.self.manage` | None                                                      | {items: RequestTypeOptionDto[]}      |
| `POST /me/hr-requests`                                         | `hcm.employee.hr-requests.self.manage` | multipart: metadata {typeId, subject, description}, file? | HrServiceRequestSelfDto              |
| `POST /me/hr-requests/{id}/messages`                           | `hcm.employee.hr-requests.self.manage` | multipart: metadata {body, expectedRevision}, file?       | HrServiceRequestSelfDto              |
| `POST /me/hr-requests/{id}/cancel`                             | `hcm.employee.hr-requests.self.manage` | {reason, expectedRevision}                                | HrServiceRequestSelfDto              |
| `POST /me/hr-requests/{id}/reopen`                             | `hcm.employee.hr-requests.self.manage` | {reason, expectedRevision}                                | HrServiceRequestSelfDto              |
| `GET /me/hr-requests/{id}/attachments/{attachmentId}/download` | `hcm.employee.hr-requests.self.read`   | None                                                      | Attachment bytes                     |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Creation stores the request, first message, optional attachment, initial service level targets and routing to the type’s default team in one transaction, then notifies the routed team.

## RULES

Reopen window is 7 days after resolution (DEC-HCM2-004). Attachments use the approved HCM-1 file types and 10 MiB limit.

Domain invariants are in the [domain policy](../../domains/employee/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/employee/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.employee`. Discovery stays `hcm.catalogue.MY_HR_REQUESTS.discover` and is not a business permission.

| Business permission                    | Authorized function                             |
| -------------------------------------- | ----------------------------------------------- |
| `hcm.employee.hr-requests.self.read`   | Read own requests and employee-visible content  |
| `hcm.employee.hr-requests.self.manage` | Raise, reply to, cancel and reopen own requests |

Subject scope: Self scope: requests whose requester worker is the verified account’s worker. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model             | Owner     | Use                                     |
| ------------------------------- | --------- | --------------------------------------- |
| `hr_service_request`            | employee  | owned                                   |
| `hr_service_request_message`    | employee  | owned                                   |
| `hr_service_request_attachment` | employee  | owned                                   |
| `hr_service_request_type`       | employee  | read                                    |
| `hr_service_level_target`       | employee  | written by lifecycle rules              |
| `document_blob`                 | documents | attachments through DocumentStoragePort |
| `employee_command_receipt`      | employee  | idempotency receipts                    |
| `audit_event`                   | audit     | append through the audit port           |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin: `HcmDynamicPage` titled My HR Requests with a SegmentedButton view (Open, Closed), New request action and table. Mid: `HcmObjectPage` with Conversation (UI5 Timeline plus reply composer), Details and Attachments. New request, Cancel and Reopen use Dialogs.

Semantic controls: Status uses inverted ObjectStatus. Type uses UI5 Select. Subject uses UI5 Input; description and replies UI5 TextArea; attachment UI5 FileUploader.

Table declaration: Mode **server**, 25 per page, growing, whole-row navigation.

Forms: Signal Forms for the create dialog and composer.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader, Timeline, TimelineItem                                                                                                                                                                               |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, SegmentedButton, SegmentedButtonItem, Input, TextArea, Select, Option, FileUploader |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                                                                        |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                   | Root                                           | Tags                                                                   |
| ----------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `hcm-web-employee-feature-my-hr-requests` | `libs/hcm/web/employee/feature-my-hr-requests` | `product:hcm`, `runtime:web`, `domain:employee`, `type:feature`        |
| `hcm-web-employee-data-access`            | `libs/hcm/web/employee/data-access`            | `product:hcm`, `runtime:web`, `domain:employee`, `type:data-access`    |
| `hcm-employee-contract`                   | `libs/hcm/contracts/employee`                  | `product:hcm`, `runtime:universal`, `domain:employee`, `type:contract` |
| `hcm-api-employee-domain`                 | `libs/hcm/api/employee/domain`                 | `product:hcm`, `runtime:api`, `domain:employee`, `type:domain`         |
| `hcm-api-employee-application`            | `libs/hcm/api/employee/application`            | `product:hcm`, `runtime:api`, `domain:employee`, `type:application`    |
| `hcm-api-employee-infrastructure`         | `libs/hcm/api/employee/infrastructure`         | `product:hcm`, `runtime:api`, `domain:employee`, `type:infrastructure` |
| `hcm-api-employee-transport`              | `libs/hcm/api/employee/transport`              | `product:hcm`, `runtime:api`, `domain:employee`, `type:transport`      |
| `hcm-api-employee-module`                 | `libs/hcm/api/employee/module`                 | `product:hcm`, `runtime:api`, `domain:employee`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

HR Service Desk foundation.

| Prerequisite               | State      | Note                                     |
| -------------------------- | ---------- | ---------------------------------------- |
| `hcm2-shared-contract`     | resolved   | Shared HCM-2 design complete for review. |
| `hcm2-physical-model`      | resolved   | Shared HCM-2 design complete for review. |
| `hcm2-permission-register` | resolved   | Shared HCM-2 design complete for review. |
| `hr-service-foundation`    | unresolved | HR Service Desk foundation implemented.  |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

No seeded conversations. `access.hcm2@1` grants self read and manage to all four personas. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-my-hr-requests`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-employee): add self-service HR request contracts`
- `feat(hcm-employee): expose authorized my HR requests API`
- `feat(hcm-employee): add my HR requests native UI`
- `test(hcm-employee): verify my HR requests acceptance`
