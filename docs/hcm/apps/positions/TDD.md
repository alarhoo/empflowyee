# Positions — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/job-architecture/positions`; lazy feature `libs/hcm/web/job-architecture/feature-positions` (`hcm-web-job-architecture-feature-positions`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

Occupancy comes from `PositionOccupancyPort`, which returns `{headcount, fte, complete}` at an instant. Complete is false when any linked assignment is a minimal spine row. Remaining capacity is derived in the application layer.

Query behavior: Server mode. q matches code and name; filters status, unitId, departmentId, locationId, profileId, hasVacancy; sort code or name, then id.

## API

All DTOs and validation belong to `hcm-job-architecture-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/job-architecture/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/job-architecture`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                                      | Permission                               | Request                                                                           | Response                       |
| ---------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------ |
| `GET /positions`                               | `hcm.job-architecture.positions.read`    | List query: status?, unitId?, departmentId?, locationId?, profileId?, hasVacancy? | Page<PositionSummaryDto>       |
| `GET /positions/{id}`                          | `hcm.job-architecture.positions.read`    | None                                                                              | PositionDetailDto              |
| `GET /positions/{id}/incumbents`               | `hcm.job-architecture.positions.read`    | List query                                                                        | Page<IncumbentDto>             |
| `GET /positions/{id}/versions`                 | `hcm.job-architecture.positions.read`    | List query                                                                        | Page<PositionVersionDto>       |
| `GET /position-change-requests`                | `hcm.job-architecture.positions.read`    | List query: status?, positionId?, view? (mine\|awaiting-my-decision)              | Page<PositionChangeRequestDto> |
| `GET /position-change-requests/{id}`           | `hcm.job-architecture.positions.read`    | None                                                                              | PositionChangeRequestDto       |
| `GET /position-options/{kind}`                 | `hcm.job-architecture.positions.request` | List query: q                                                                     | Page<StructureOptionDto>       |
| `POST /position-change-requests`               | `hcm.job-architecture.positions.request` | {requestType, positionId?, proposed?, reason}                                     | PositionChangeRequestDto       |
| `PUT /position-change-requests/{id}`           | `hcm.job-architecture.positions.request` | {proposed, reason, expectedRevision}                                              | PositionChangeRequestDto       |
| `POST /position-change-requests/{id}/preview`  | `hcm.job-architecture.positions.request` | {expectedRevision}                                                                | PositionChangeRequestDto       |
| `POST /position-change-requests/{id}/submit`   | `hcm.job-architecture.positions.request` | {previewId, expectedRevision}                                                     | PositionChangeRequestDto       |
| `POST /position-change-requests/{id}/withdraw` | `hcm.job-architecture.positions.request` | {expectedRevision, reason}                                                        | PositionChangeRequestDto       |
| `POST /position-change-requests/{id}/decide`   | `hcm.job-architecture.positions.approve` | {decision: Approved\|Rejected, comment, expectedRevision}                         | PositionChangeRequestDto       |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Requests move Draft, Previewed, Submitted, PendingApproval, Approved, Applying, Applied, or Rejected, Withdrawn, Failed. Preview builds a `position_impact_preview` with a 15-minute expiry and source digest. Final approval applies the change in the same transaction: publish successor version, close previous range, update lifecycle status, append audit and notify the requester.

## RULES

Reason text and decision comments are encrypted under the field-encryption ADR and visible only to the requester and approvers. Relationships reject self-reference and cycles. Capacity per DEC-HCM2-007: `PositionReadPort.capacityDecision(positionId, asOf, addedHeadcount, addedFte)` allows the assignment only when occupancy is complete, occupied headcount plus one stays within headcount capacity and occupied FTE plus the new FTE stays within FTE capacity. Approval per DEC-HCM2-008: one slot for every request type; the requester is excluded by trigger.

Domain invariants are in the [domain policy](../../domains/job-architecture/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/job-architecture/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.job-architecture`. Discovery stays `hcm.catalogue.POSITIONS.discover` and is not a business permission.

| Business permission                      | Authorized function                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `hcm.job-architecture.positions.read`    | Read positions, incumbents, versions and change requests               |
| `hcm.job-architecture.positions.request` | Create, edit, preview, submit and withdraw position change requests    |
| `hcm.job-architecture.positions.approve` | Decide position change requests under DEC-HCM2-008; never own requests |

Subject scope: Tenant scope. Incumbent display uses Organization-visible fields only. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model                | Owner                | Use                                |
| ---------------------------------- | -------------------- | ---------------------------------- |
| `position`                         | job-architecture     | owned                              |
| `position_version`                 | job-architecture     | owned                              |
| `position_relationship`            | job-architecture     | owned                              |
| `position_change_request`          | job-architecture     | owned                              |
| `position_change_item`             | job-architecture     | owned                              |
| `position_approval_case`           | job-architecture     | owned                              |
| `position_decision`                | job-architecture     | owned                              |
| `position_impact_preview`          | job-architecture     | owned                              |
| `job_profile_version`              | job-architecture     | read                               |
| `job_profile_grade`                | job-architecture     | read                               |
| `assignment`                       | workforce-foundation | read through PositionOccupancyPort |
| `job_architecture_command_receipt` | job-architecture     | idempotency receipts               |
| `audit_event`                      | audit                | append through the audit port      |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout with three columns. Begin: `HcmDynamicPage` with filters and position table. Mid: `HcmObjectPage` with Overview, Capacity and incumbents, Relationships, Versions (UI5 Timeline) and Change requests. End: `HcmObjectPage` for a selected change request with Overview, Proposed changes, Impact preview and Decision. New position and Change use the dedicated routes `/job-architecture/positions/new` and `/job-architecture/positions/:id/change`. Freeze, Reopen, Close, Cancel, Withdraw and Approve/Reject use Dialogs.

Semantic controls: Lifecycle and request status use inverted ObjectStatus; capacity shortfall uses Critical status with text. Capacities use UI5 StepInput (headcount integer, FTE step 0.01). Structure and profile pickers use UI5 ComboBox with server filtering. Effective date uses UI5 DatePicker. Incumbent names use Avatar and text.

Table declaration: Positions: mode **server**, 25 per page, growing, whole-row navigation. Incumbents and versions: server, 25 per page. Change requests: server, 25 per page.

Forms: Signal Forms on the dedicated pages and dialogs. Preview is explicit; editing any field after preview marks the preview stale in the UI and server.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader, Timeline, TimelineItem, ViewSettingsDialog                                                                                                                                                                              |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, Input, TextArea, Select, Option, ComboBox, ComboBoxItem, StepInput, DatePicker, CheckBox, Avatar, Link |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                                                                                           |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                      | Root                                              | Tags                                                                           |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `hcm-web-job-architecture-feature-positions` | `libs/hcm/web/job-architecture/feature-positions` | `product:hcm`, `runtime:web`, `domain:job-architecture`, `type:feature`        |
| `hcm-web-job-architecture-data-access`       | `libs/hcm/web/job-architecture/data-access`       | `product:hcm`, `runtime:web`, `domain:job-architecture`, `type:data-access`    |
| `hcm-job-architecture-contract`              | `libs/hcm/contracts/job-architecture`             | `product:hcm`, `runtime:universal`, `domain:job-architecture`, `type:contract` |
| `hcm-api-job-architecture-domain`            | `libs/hcm/api/job-architecture/domain`            | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:domain`         |
| `hcm-api-job-architecture-application`       | `libs/hcm/api/job-architecture/application`       | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:application`    |
| `hcm-api-job-architecture-infrastructure`    | `libs/hcm/api/job-architecture/infrastructure`    | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:infrastructure` |
| `hcm-api-job-architecture-transport`         | `libs/hcm/api/job-architecture/transport`         | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:transport`      |
| `hcm-api-job-architecture-module`            | `libs/hcm/api/job-architecture/module`            | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Job Catalogue foundation; migrations `000023` and `000024`; `PositionOccupancyPort` from Workforce Foundation; notification event registration for position change events.

| Prerequisite               | State      | Note                                                                   |
| -------------------------- | ---------- | ---------------------------------------------------------------------- |
| `hcm2-shared-contract`     | resolved   | Shared HCM-2 design complete for review.                               |
| `hcm2-physical-model`      | resolved   | Shared HCM-2 design complete for review.                               |
| `hcm2-permission-register` | resolved   | Shared HCM-2 design complete for review.                               |
| `job-catalogue-published`  | unresolved | Job Catalogue foundation implemented and a published catalogue seeded. |
| `field-encryption-adr`     | unresolved | Field-encryption ADR accepted for reasons and comments.                |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`job.architecture@1` seeds Scranton positions and links existing assignments. `access.hcm2@1` grants read to Toby and David, request to Toby and approve to David. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-positions`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-job-architecture): add position contracts and persistence`
- `feat(hcm-job-architecture): expose authorized position change API`
- `feat(hcm-job-architecture): add positions native UI`
- `test(hcm-job-architecture): verify positions acceptance`
