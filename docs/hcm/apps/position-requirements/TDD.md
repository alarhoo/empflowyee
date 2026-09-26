# Position Requirements — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/job-architecture/position-requirements`; lazy feature `libs/hcm/web/job-architecture/feature-position-requirements` (`hcm-web-job-architecture-feature-position-requirements`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

Effective requirements are computed in the application layer from the published position version’s variances and its profile version’s requirements.

Query behavior: Positions: server mode, q code/name, filter hasVariances, sort code then id. Requirements: bounded client list (maximum 200 per position).

## API

All DTOs and validation belong to `hcm-job-architecture-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/job-architecture/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/job-architecture`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                                         | Permission                                           | Request                                        | Response                            |
| ------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| `GET /position-requirements`                      | `hcm.job-architecture.position-requirements.read`    | List query: hasVariances?                      | Page<PositionRequirementSummaryDto> |
| `GET /positions/{id}/requirements`                | `hcm.job-architecture.position-requirements.read`    | None                                           | {items: EffectiveRequirementDto[]}  |
| `GET /positions/{id}/profile-requirements`        | `hcm.job-architecture.position-requirements.read`    | None                                           | {items: RequirementDto[]}           |
| `POST /positions/{id}/requirement-changes`        | `hcm.job-architecture.position-requirements.request` | {variances: VarianceDraft[], reason}           | PositionChangeRequestDto            |
| `PUT /position-change-requests/{id}/requirements` | `hcm.job-architecture.position-requirements.request` | {variances: VarianceDraft[], expectedRevision} | PositionChangeRequestDto            |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Variance edits change `position_change_item` rows of a Draft request. Preview, submit, withdraw and decide use the Positions endpoints; this app deep-links to the request in Positions for decision.

## RULES

All four variance types are allowed (DEC-HCM2-009). A request containing a Waive requires the approver to hold `hcm.job-architecture.position-requirements.waive` in addition to `positions.approve`. Justification is stored only as ciphertext under the field-encryption ADR. Requirement codes are unique within the proposed position version.

Domain invariants are in the [domain policy](../../domains/job-architecture/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/job-architecture/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.job-architecture`. Discovery stays `hcm.catalogue.POSITION_REQUIREMENTS.discover` and is not a business permission.

| Business permission                                  | Authorized function                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `hcm.job-architecture.position-requirements.read`    | Read effective and profile requirements                                            |
| `hcm.job-architecture.position-requirements.request` | Propose requirement variances in a position change request                         |
| `hcm.job-architecture.position-requirements.waive`   | Required, together with positions.approve, to approve a request containing a Waive |

Subject scope: Tenant scope; no person subject. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model                | Owner            | Use                           |
| ---------------------------------- | ---------------- | ----------------------------- |
| `position_requirement`             | job-architecture | owned                         |
| `position_change_request`          | job-architecture | owned                         |
| `position_change_item`             | job-architecture | owned                         |
| `position_version`                 | job-architecture | read                          |
| `job_profile_requirement`          | job-architecture | read                          |
| `job_architecture_command_receipt` | job-architecture | idempotency receipts          |
| `audit_event`                      | audit            | append through the audit port |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin: `HcmDynamicPage` with the position table. Mid: `HcmObjectPage` with Effective requirements, Profile requirements and Variance history sections. Add, Replace, Strengthen and Waive use native Dialogs. Submit opens a confirmation Dialog showing the preview.

Semantic controls: Variance and source use inverted ObjectStatus (Waived is Critical). Requirement type and unit use UI5 Select; minimum quantity UI5 StepInput; mandatory UI5 CheckBox; justification UI5 TextArea (required for Waive, ≤2000).

Table declaration: Positions: mode **server**, 25 per page, growing, whole-row navigation. Requirements: mode **client**, bounded to 200.

Forms: Signal Forms per dialog. Server re-validates variance types against DEC-HCM2-009.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader                                                                                                                                                                        |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, Input, TextArea, Select, Option, StepInput, CheckBox |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                                         |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                                  | Root                                                          | Tags                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `hcm-web-job-architecture-feature-position-requirements` | `libs/hcm/web/job-architecture/feature-position-requirements` | `product:hcm`, `runtime:web`, `domain:job-architecture`, `type:feature`        |
| `hcm-web-job-architecture-data-access`                   | `libs/hcm/web/job-architecture/data-access`                   | `product:hcm`, `runtime:web`, `domain:job-architecture`, `type:data-access`    |
| `hcm-job-architecture-contract`                          | `libs/hcm/contracts/job-architecture`                         | `product:hcm`, `runtime:universal`, `domain:job-architecture`, `type:contract` |
| `hcm-api-job-architecture-domain`                        | `libs/hcm/api/job-architecture/domain`                        | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:domain`         |
| `hcm-api-job-architecture-application`                   | `libs/hcm/api/job-architecture/application`                   | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:application`    |
| `hcm-api-job-architecture-infrastructure`                | `libs/hcm/api/job-architecture/infrastructure`                | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:infrastructure` |
| `hcm-api-job-architecture-transport`                     | `libs/hcm/api/job-architecture/transport`                     | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:transport`      |
| `hcm-api-job-architecture-module`                        | `libs/hcm/api/job-architecture/module`                        | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Positions change-request foundation and migration `000023`.

| Prerequisite                 | State    | Note                                                                                                                                                                     |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hcm2-shared-contract`       | resolved | Shared HCM-2 design complete.                                                                                                                                            |
| `hcm2-physical-model`        | resolved | Shared HCM-2 design complete.                                                                                                                                            |
| `hcm2-permission-register`   | resolved | Shared HCM-2 design complete.                                                                                                                                            |
| `position-change-foundation` | resolved | Design resolved. Implemented in its [delivery step](../../roadmap/HCM-2-DESIGN-REVIEW.md#order) before this app ships: Positions change-request foundation implemented.  |
| `field-encryption-adr`       | resolved | Design resolved. Implemented in its [delivery step](../../roadmap/HCM-2-DESIGN-REVIEW.md#order) before this app ships: Field-encryption ADR accepted for justifications. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`job.architecture@1` seeds profile requirements; no seeded waivers. `access.hcm2@1` grants read to Toby and David, request to Toby, waive to David. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-position-requirements`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-job-architecture): add position requirement variance contracts`
- `feat(hcm-job-architecture): expose authorized requirement variance API`
- `feat(hcm-job-architecture): add position requirements native UI`
- `test(hcm-job-architecture): verify position requirements acceptance`
