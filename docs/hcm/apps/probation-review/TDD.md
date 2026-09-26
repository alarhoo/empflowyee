# Probation Review — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/employee/probation-review`; lazy feature `libs/hcm/web/employee/feature-probation-review` (`hcm-web-employee-feature-probation-review`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

Reviewer queries always include the account predicate; review IDs outside that set return 404.

Query behavior: Server mode, own assigned reviews; filter status; sort due date then id.

## API

All DTOs and validation belong to `hcm-employee-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/employee/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/employee`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                                     | Permission                      | Request                                                                                      | Response                       |
| --------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------ |
| `GET /me/probation-reviews`                   | `hcm.employee.probation.review` | List query: status?                                                                          | Page<ReviewerReviewSummaryDto> |
| `GET /me/probation-reviews/{id}`              | `hcm.employee.probation.review` | None                                                                                         | ReviewerReviewDto              |
| `POST /me/probation-reviews/{id}/assessments` | `hcm.employee.probation.review` | {recommendation, overallRating, strengths, concerns, recommendationReason, expectedRevision} | ReviewerReviewDto              |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Submission inserts a new assessment version, supersedes the previous one, moves the review to AssessmentSubmitted and notifies the owning HR account.

## RULES

Per DEC-HCM2-003, the rating is an integer from 1 to 5, and recommendations are Confirm, Extend, Fail and NoChange. Assessments are append-only apart from supersession linkage.

Domain invariants are in the [domain policy](../../domains/employee/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/employee/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.employee`. Discovery stays `hcm.catalogue.PROBATION_REVIEW.discover` and is not a business permission.

| Business permission             | Authorized function                           |
| ------------------------------- | --------------------------------------------- |
| `hcm.employee.probation.review` | Read and assess reviews assigned to the actor |

Subject scope: Assigned scope: reviews whose `primary_reviewer_account_id` is the verified account. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model        | Owner    | Use                           |
| -------------------------- | -------- | ----------------------------- |
| `probation_review`         | employee | read                          |
| `probation_assessment`     | employee | owned                         |
| `probation_decision`       | employee | read                          |
| `employee_command_receipt` | employee | idempotency receipts          |
| `audit_event`              | audit    | append through the audit port |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin: `HcmDynamicPage` titled Probation Review with the review table. Mid: `HcmObjectPage` with Employee, Assessment and History sections. The assessment uses the dedicated route `/employee/probation-review/:id/assessment` with dirty-leave protection.

Semantic controls: Review status uses inverted ObjectStatus. Recommendation uses UI5 Select. The 1–5 rating uses UI5 RatingIndicator with `max=5` and an accessible label. Text fields use UI5 TextArea.

Table declaration: Mode **server**, 25 per page, growing, whole-row navigation.

Forms: Signal Forms on the assessment page.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader                                                                                                                                                             |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, TextArea, Select, Option, RatingIndicator |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                              |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                     | Root                                             | Tags                                                                   |
| ------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| `hcm-web-employee-feature-probation-review` | `libs/hcm/web/employee/feature-probation-review` | `product:hcm`, `runtime:web`, `domain:employee`, `type:feature`        |
| `hcm-web-employee-data-access`              | `libs/hcm/web/employee/data-access`              | `product:hcm`, `runtime:web`, `domain:employee`, `type:data-access`    |
| `hcm-employee-contract`                     | `libs/hcm/contracts/employee`                    | `product:hcm`, `runtime:universal`, `domain:employee`, `type:contract` |
| `hcm-api-employee-domain`                   | `libs/hcm/api/employee/domain`                   | `product:hcm`, `runtime:api`, `domain:employee`, `type:domain`         |
| `hcm-api-employee-application`              | `libs/hcm/api/employee/application`              | `product:hcm`, `runtime:api`, `domain:employee`, `type:application`    |
| `hcm-api-employee-infrastructure`           | `libs/hcm/api/employee/infrastructure`           | `product:hcm`, `runtime:api`, `domain:employee`, `type:infrastructure` |
| `hcm-api-employee-transport`                | `libs/hcm/api/employee/transport`                | `product:hcm`, `runtime:api`, `domain:employee`, `type:transport`      |
| `hcm-api-employee-module`                   | `libs/hcm/api/employee/module`                   | `product:hcm`, `runtime:api`, `domain:employee`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Probation Management foundation.

| Prerequisite               | State      | Note                                         |
| -------------------------- | ---------- | -------------------------------------------- |
| `hcm2-shared-contract`     | resolved   | Shared HCM-2 design complete for review.     |
| `hcm2-physical-model`      | resolved   | Shared HCM-2 design complete for review.     |
| `hcm2-permission-register` | resolved   | Shared HCM-2 design complete for review.     |
| `probation-foundation`     | unresolved | Probation Management foundation implemented. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`employee.operations@1` assigns Michael to the seeded review. `access.hcm2@1` grants review to Michael. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-probation-review`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-employee): add probation reviewer contracts and queries`
- `feat(hcm-employee): expose authorized probation review API`
- `feat(hcm-employee): add probation review native UI`
- `test(hcm-employee): verify probation review acceptance`
