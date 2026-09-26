# Probation Management — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/employee/probation-management`; lazy feature `libs/hcm/web/employee/feature-probation-management` (`hcm-web-employee-feature-probation-management`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

Cases join employment probation facts with the next open review. Overdue uses the organisation time zone date.

Query behavior: Server mode. Views due soon, overdue, all; filters status, reviewType, unitId; sort due date then id.

## API

All DTOs and validation belong to `hcm-employee-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/employee/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/employee`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                               | Permission                      | Request                                                                                           | Response                        |
| --------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------- |
| `GET /probation/cases`                  | `hcm.employee.probation.read`   | List query: view?, unitId?                                                                        | Page<ProbationCaseDto>          |
| `GET /probation/reviews`                | `hcm.employee.probation.read`   | List query: status?, reviewType?                                                                  | Page<ProbationReviewSummaryDto> |
| `GET /probation/reviews/{id}`           | `hcm.employee.probation.read`   | None                                                                                              | ProbationReviewDto              |
| `POST /probation/reviews`               | `hcm.employee.probation.manage` | {employmentId, reviewType, periodStart, periodEnd, dueDate, reviewerAccountId, reason}            | ProbationReviewDto              |
| `POST /probation/reviews/{id}/reviewer` | `hcm.employee.probation.manage` | {reviewerAccountId, expectedRevision, reason}                                                     | ProbationReviewDto              |
| `POST /probation/reviews/{id}/cancel`   | `hcm.employee.probation.manage` | {expectedRevision, reason}                                                                        | ProbationReviewDto              |
| `POST /probation/reviews/{id}/decision` | `hcm.employee.probation.manage` | {outcome, effectiveDate, extendedProbationEndDate?, reason, evidenceReference?, expectedRevision} | ProbationReviewDto              |
| `GET /probation/options/{kind}`         | `hcm.employee.probation.manage` | List query: q                                                                                     | Page<OptionDto>                 |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Decision writes `probation_decision`, updates the review to Decided, applies employment facts (status, confirmed date or extended end date) through `WorkforceFactsPort.applyEmploymentFacts`, records a Confirmed or Other worker event, and creates the next review for Extend, all in one transaction.

## RULES

Defaults per DEC-HCM2-003: one Final review due 14 days before the end date, a 1–5 rating, one extension of at most 90 days beyond the original end date, and escalation 7 days after the due date. A decision is final for its review; corrections use Employment Changes.

Domain invariants are in the [domain policy](../../domains/employee/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/employee/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.employee`. Discovery stays `hcm.catalogue.PROBATION_MANAGEMENT.discover` and is not a business permission.

| Business permission             | Authorized function                                      |
| ------------------------------- | -------------------------------------------------------- |
| `hcm.employee.probation.read`   | Read probation cases, reviews, assessments and decisions |
| `hcm.employee.probation.manage` | Schedule, reassign, cancel and decide reviews            |

Subject scope: Tenant scope with HR relation. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model        | Owner                | Use                                              |
| -------------------------- | -------------------- | ------------------------------------------------ |
| `probation_review`         | employee             | owned                                            |
| `probation_assessment`     | employee             | read                                             |
| `probation_decision`       | employee             | owned                                            |
| `employment`               | workforce-foundation | write probation facts through WorkforceFactsPort |
| `worker_event`             | workforce-foundation | append through WorkforceFactsPort                |
| `employee_command_receipt` | employee             | idempotency receipts                             |
| `audit_event`              | audit                | append through the audit port                    |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin: `HcmDynamicPage` with SegmentedButton views and the case table. Mid: `HcmObjectPage` with Overview, Reviews, Assessments, Decision and History (UI5 Timeline). Schedule, reassign, cancel and decision use Dialogs.

Semantic controls: Probation and review status use inverted ObjectStatus (Overdue is Negative). Dates use UI5 DatePicker. Outcome and review type use UI5 Select. Reviewer uses UI5 ComboBox. Reason uses UI5 TextArea.

Table declaration: Cases and reviews: mode **server**, 25 per page, growing, whole-row navigation.

Forms: Signal Forms per dialog. The extended end date appears only for Extend.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader, Timeline, TimelineItem                                                                                                                                                                                              |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, SegmentedButton, SegmentedButtonItem, TextArea, Select, Option, ComboBox, ComboBoxItem, DatePicker |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                                                                                       |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                         | Root                                                 | Tags                                                                   |
| ----------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `hcm-web-employee-feature-probation-management` | `libs/hcm/web/employee/feature-probation-management` | `product:hcm`, `runtime:web`, `domain:employee`, `type:feature`        |
| `hcm-web-employee-data-access`                  | `libs/hcm/web/employee/data-access`                  | `product:hcm`, `runtime:web`, `domain:employee`, `type:data-access`    |
| `hcm-employee-contract`                         | `libs/hcm/contracts/employee`                        | `product:hcm`, `runtime:universal`, `domain:employee`, `type:contract` |
| `hcm-api-employee-domain`                       | `libs/hcm/api/employee/domain`                       | `product:hcm`, `runtime:api`, `domain:employee`, `type:domain`         |
| `hcm-api-employee-application`                  | `libs/hcm/api/employee/application`                  | `product:hcm`, `runtime:api`, `domain:employee`, `type:application`    |
| `hcm-api-employee-infrastructure`               | `libs/hcm/api/employee/infrastructure`               | `product:hcm`, `runtime:api`, `domain:employee`, `type:infrastructure` |
| `hcm-api-employee-transport`                    | `libs/hcm/api/employee/transport`                    | `product:hcm`, `runtime:api`, `domain:employee`, `type:transport`      |
| `hcm-api-employee-module`                       | `libs/hcm/api/employee/module`                       | `product:hcm`, `runtime:api`, `domain:employee`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Workforce employment foundation; notification event registration; migration `000027`.

| Prerequisite               | State    | Note                                     |
| -------------------------- | -------- | ---------------------------------------- |
| `hcm2-shared-contract`     | resolved | Shared HCM-2 design complete for review. |
| `hcm2-physical-model`      | resolved | Shared HCM-2 design complete for review. |
| `hcm2-permission-register` | resolved | Shared HCM-2 design complete for review. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`employee.operations@1` seeds probation facts and an open review for a fictional Dunder Mifflin hire shaped by DEC-HCM2-003. `access.hcm2@1` grants read and manage to Toby. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-probation-management`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-employee): add probation contracts and persistence`
- `feat(hcm-employee): expose authorized probation management API`
- `feat(hcm-employee): add probation management native UI`
- `test(hcm-employee): verify probation management acceptance`
