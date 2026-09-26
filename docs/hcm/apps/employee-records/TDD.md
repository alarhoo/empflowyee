# Employee Records — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/employee/employee-records`; lazy feature `libs/hcm/web/employee/feature-employee-records` (`hcm-web-employee-feature-employee-records`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

List and detail queries use `WorkforceReadPort` projections filtered by the HR allowlist. Worker events come from the append-only table ordered by effective date then recorded time.

Query behavior: Server mode. q matches normalized name, worker number prefix and work email prefix; filters status, legalEntityId, unitId, departmentId, locationId, workerTypeId, recordState; sort name or worker number, then id.

## API

All DTOs and validation belong to `hcm-employee-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/employee/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/employee`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                                       | Permission                            | Request                                                                                               | Response                              |
| ----------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `GET /records`                                  | `hcm.employee.records.read`           | List query: status?, legalEntityId?, unitId?, departmentId?, locationId?, workerTypeId?, recordState? | Page<WorkerRecordSummaryDto>          |
| `GET /records/{workerId}`                       | `hcm.employee.records.read`           | None                                                                                                  | WorkerRecordDto                       |
| `GET /records/{workerId}/events`                | `hcm.employee.records.read`           | List query                                                                                            | Page<WorkerEventDto>                  |
| `PUT /records/{workerId}/person`                | `hcm.employee.records.manage`         | {legal names, birthDate?, gender?, maritalStatus?, nationality?, expectedRevision, reason}            | WorkerRecordDto                       |
| `POST /records/{workerId}/{collection}`         | `hcm.employee.records.manage`         | {item fields, reason}                                                                                 | WorkerRecordDto                       |
| `PUT /records/{workerId}/{collection}/{itemId}` | `hcm.employee.records.manage`         | {item fields, expectedRevision, reason}                                                               | WorkerRecordDto                       |
| `POST /records/{workerId}/emergency-reveal`     | `hcm.employee.records.emergency.read` | {purpose}                                                                                             | EmergencyInfoDto                      |
| `POST /records/duplicate-check`                 | `hcm.employee.records.manage`         | {candidate facts per DEC-HCM2-001}                                                                    | {candidates: DuplicateCandidateDto[]} |
| `POST /records`                                 | `hcm.employee.records.manage`         | {person, worker, employment, assignment, reportingLine?, duplicateResolution, reason}                 | WorkerRecordDto                       |
| `GET /records/options/{kind}`                   | `hcm.employee.records.manage`         | List query: q                                                                                         | Page<StructureOptionDto>              |
| `POST /records/{workerId}/merge`                | `hcm.employee.records.manage`         | {survivorWorkerId, expectedRevision, survivorExpectedRevision, reason}                                | WorkerRecordDto                       |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Corrections and creation run under the tenant lock with expected revisions and idempotency. Creation calls `WorkforceFactsPort.createPersonWithWorker`, `createEmployment`, `openAssignment` and `setReportingLine` in one unit of work, then records the Hired event.

## RULES

Duplicate detection per DEC-HCM2-001 compares normalized legal names with equal birth dates and case-insensitive work emails. It uses no identifiers. Candidates block creation until resolved. `display_name` and `search_text` are recomputed on name changes. Sensitive custom values are rejected until the field-encryption ADR is accepted.

Domain invariants are in the [domain policy](../../domains/employee/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/employee/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.employee`. Discovery stays `hcm.catalogue.EMPLOYEE_RECORDS.discover` and is not a business permission.

| Business permission                   | Authorized function                                        |
| ------------------------------------- | ---------------------------------------------------------- |
| `hcm.employee.records.read`           | Read tenant worker records with the HR allowlist           |
| `hcm.employee.records.manage`         | Correct person facts and create workers                    |
| `hcm.employee.records.emergency.read` | Reveal emergency-purpose information with a stated purpose |

Subject scope: Tenant scope with HR relation. `collection` is addresses, contact-points or relationships. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model        | Owner                | Use                               |
| -------------------------- | -------------------- | --------------------------------- |
| `person`                   | workforce-foundation | write through WorkforceFactsPort  |
| `person_address`           | workforce-foundation | write through WorkforceFactsPort  |
| `person_contact_point`     | workforce-foundation | write through WorkforceFactsPort  |
| `person_relationship`      | workforce-foundation | write through WorkforceFactsPort  |
| `worker`                   | workforce-foundation | create through WorkforceFactsPort |
| `employment`               | workforce-foundation | create through WorkforceFactsPort |
| `assignment`               | workforce-foundation | create through WorkforceFactsPort |
| `reporting_line`           | workforce-foundation | create through WorkforceFactsPort |
| `worker_event`             | workforce-foundation | append through WorkforceFactsPort |
| `custom_field_value`       | employee             | owned                             |
| `employee_command_receipt` | employee             | idempotency receipts              |
| `audit_event`              | audit                | append through the audit port     |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin: `HcmDynamicPage` titled Employee Records with search, filters and table. Mid: `HcmObjectPage` with Overview, Personal, Contact, Addresses, Family and emergency, Employments, Assignments, Reporting, Additional information and History (UI5 Timeline). Corrections use Dialogs with a reason. Emergency reveal uses a Dialog asking for purpose. Create worker uses the Wizard route `/employee/employee-records/new` with steps Person, Employment, Assignment and manager, Duplicate check, Review.

Semantic controls: Employment status and record state use inverted ObjectStatus. Dates use UI5 DatePicker. Gender, marital status, employment type and work mode use UI5 Select. Structure, position and manager pickers use UI5 ComboBox. FTE and hours use UI5 StepInput. Emails and phones use UI5 Link.

Table declaration: Mode **server**, 25 per page, growing, whole-row navigation; Popin retains unit and status.

Forms: Signal Forms for dialogs and each wizard step; the Review step submits once with a single idempotency key.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader, Wizard, WizardStep, Timeline, TimelineItem, ViewSettingsDialog                                                                                                                                                          |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, Avatar, Link, Input, TextArea, Select, Option, ComboBox, ComboBoxItem, CheckBox, StepInput, DatePicker |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                                                                                           |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                     | Root                                             | Tags                                                                   |
| ------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| `hcm-web-employee-feature-employee-records` | `libs/hcm/web/employee/feature-employee-records` | `product:hcm`, `runtime:web`, `domain:employee`, `type:feature`        |
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

Workforce structure, people and employment foundations; Employee profile policy foundation; shared wizard acceptance.

| Prerequisite                  | State    | Note                                                                                                                                                          |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hcm2-shared-contract`        | resolved | Shared HCM-2 design complete.                                                                                                                                 |
| `hcm2-physical-model`         | resolved | Shared HCM-2 design complete.                                                                                                                                 |
| `hcm2-permission-register`    | resolved | Shared HCM-2 design complete.                                                                                                                                 |
| `wizard-floorplan-acceptance` | resolved | Design resolved. Implemented in its [delivery step](../../roadmap/HCM-2-DESIGN-REVIEW.md#order) before this app ships: Shared HcmWizardPage accepted.         |
| `employee-field-policy`       | resolved | Design resolved. Implemented in its [delivery step](../../roadmap/HCM-2-DESIGN-REVIEW.md#order) before this app ships: Profile policy foundation implemented. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`workforce.foundation@3` supplies complete records. `access.hcm2@1` grants read, manage and emergency read to Toby. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-employee-records`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-employee): add employee record contracts and commands`
- `feat(hcm-employee): expose authorized employee records API`
- `feat(hcm-employee): add employee records native UI`
- `test(hcm-employee): verify employee records acceptance`
