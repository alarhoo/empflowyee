# Employee Import — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/employee/employee-import`; lazy feature `libs/hcm/web/employee/feature-employee-import` (`hcm-web-employee-feature-employee-import`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

Validation streams the staged source through the parser within limits and writes only row, issue and match metadata. Candidate matching reads `WorkforceReadPort` using the approved inputs.

Query behavior: Runs and templates: server mode, sort created time desc then id. Rows: server mode, filters status and matchStatus, sort row number.

## API

All DTOs and validation belong to `hcm-employee-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/employee/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/employee`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                                        | Permission                   | Request                                                                                     | Response                |
| ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------- | ----------------------- |
| `GET /import/templates`                          | `hcm.employee.import.read`   | List query: status?                                                                         | Page<ImportTemplateDto> |
| `GET /import/templates/{id}`                     | `hcm.employee.import.read`   | None                                                                                        | ImportTemplateDetailDto |
| `POST /import/templates`                         | `hcm.employee.import.manage` | {code, name, description?, fileFormat, hasHeaderRow, dateFormat, timeZone, columns, reason} | ImportTemplateDetailDto |
| `PUT /import/templates/{id}`                     | `hcm.employee.import.manage` | {draft fields, columns, expectedRevision, reason}                                           | ImportTemplateDetailDto |
| `POST /import/templates/{id}/publish`            | `hcm.employee.import.manage` | {expectedRevision, reason}                                                                  | ImportTemplateDetailDto |
| `POST /import/templates/{id}/versions`           | `hcm.employee.import.manage` | {reason}                                                                                    | ImportTemplateDetailDto |
| `GET /import/runs`                               | `hcm.employee.import.read`   | List query: status?                                                                         | Page<ImportRunDto>      |
| `GET /import/runs/{id}`                          | `hcm.employee.import.read`   | None                                                                                        | ImportRunDto            |
| `GET /import/runs/{id}/rows`                     | `hcm.employee.import.read`   | List query: status?, matchStatus?                                                           | Page<ImportRowDto>      |
| `POST /import/runs`                              | `hcm.employee.import.manage` | multipart: metadata {templateId, intendedAction}, file                                      | ImportRunDto            |
| `POST /import/runs/{id}/validate`                | `hcm.employee.import.manage` | {expectedRevision}                                                                          | ImportRunDto            |
| `POST /import/runs/{id}/rows/{rowId}/resolution` | `hcm.employee.import.manage` | {resolution, candidateWorkerId?, expectedRevision}                                          | ImportRowDto            |
| `POST /import/runs/{id}/commit`                  | `hcm.employee.import.manage` | {expectedRevision}                                                                          | ImportRunDto            |
| `POST /import/runs/{id}/cancel`                  | `hcm.employee.import.manage` | {expectedRevision, reason}                                                                  | ImportRunDto            |
| `GET /import/runs/{id}/issues/report`            | `hcm.employee.import.read`   | None                                                                                        | text/csv attachment     |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Commit processes valid, resolved rows in ascending order. Each row runs in its own savepoint under the run lock, keyed by `row_idempotency_key`. A row failure records `CommitFailed` without aborting committed rows. The run ends Completed, CompletedWithErrors or Failed.

## RULES

Import rows never store raw source values. Templates may map only fields whose product policy allows import, identified in the field catalogue. Sensitive custom fields cannot be imported until the field-encryption ADR is accepted. Matching per DEC-HCM2-001 uses normalized legal name plus birth date and work email only.

Domain invariants are in the [domain policy](../../domains/employee/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/employee/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.employee`. Discovery stays `hcm.catalogue.EMPLOYEE_IMPORT.discover` and is not a business permission.

| Business permission          | Authorized function                                                     |
| ---------------------------- | ----------------------------------------------------------------------- |
| `hcm.employee.import.read`   | Read templates, runs, rows and the safe issue report                    |
| `hcm.employee.import.manage` | Maintain templates and start, validate, resolve, commit and cancel runs |

Subject scope: Tenant scope with HR relation. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model               | Owner                | Use                                               |
| --------------------------------- | -------------------- | ------------------------------------------------- |
| `employee_import_template`        | employee             | owned                                             |
| `employee_import_template_column` | employee             | owned                                             |
| `employee_import_run`             | employee             | owned                                             |
| `employee_import_row`             | employee             | owned                                             |
| `employee_import_issue`           | employee             | owned                                             |
| `document_blob`                   | documents            | import-source purpose through DocumentStoragePort |
| `person`                          | workforce-foundation | write through WorkforceFactsPort                  |
| `worker`                          | workforce-foundation | write through WorkforceFactsPort                  |
| `employment`                      | workforce-foundation | write through WorkforceFactsPort                  |
| `assignment`                      | workforce-foundation | write through WorkforceFactsPort                  |
| `custom_field_value`              | employee             | owned                                             |
| `employee_command_receipt`        | employee             | idempotency receipts                              |
| `audit_event`                     | audit                | append through the audit port                     |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin: `HcmDynamicPage` with a SegmentedButton scope (Runs, Templates) and table. Mid: `HcmObjectPage` for a run (Overview with counts, Rows, Issues) or a template (Overview, Columns). New run uses the Wizard route `/employee/employee-import/runs/new` with steps Template and action, Upload, Validate, Review matches, Commit. Templates use the dedicated route `/employee/employee-import/templates/:id/edit`.

Semantic controls: Run and row status use inverted ObjectStatus. File upload uses UI5 FileUploader with accept and size limits. Format, date format, action and transformations use UI5 Select. Field mapping uses UI5 ComboBox. Header row and match key use UI5 CheckBox.

Table declaration: Runs, templates and rows: mode **server**, 25 per page, growing. Rows support filters by status and match status; no bulk resolution in HCM-2.

Forms: Signal Forms per wizard step and template editor. Wizard steps unlock only after the server confirms the previous step.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader, Wizard, WizardStep, ViewSettingsDialog                                                                                                                                                                                                 |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, SegmentedButton, SegmentedButtonItem, Input, TextArea, Select, Option, ComboBox, ComboBoxItem, CheckBox, FileUploader |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                                                                                                          |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                    | Root                                            | Tags                                                                   |
| ------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `hcm-web-employee-feature-employee-import` | `libs/hcm/web/employee/feature-employee-import` | `product:hcm`, `runtime:web`, `domain:employee`, `type:feature`        |
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

Workforce foundations; Employee profile policy foundation; documents import-source extension; shared wizard acceptance; migration `000026`.

| Prerequisite                  | State      | Note                                                                             |
| ----------------------------- | ---------- | -------------------------------------------------------------------------------- |
| `hcm2-shared-contract`        | resolved   | Shared HCM-2 design complete for review.                                         |
| `hcm2-physical-model`         | resolved   | Shared HCM-2 design complete for review.                                         |
| `hcm2-permission-register`    | resolved   | Shared HCM-2 design complete for review.                                         |
| `wizard-floorplan-acceptance` | unresolved | Shared HcmWizardPage accepted.                                                   |
| `documents-import-source`     | resolved   | Documents import-source design; migration delivered before the import migration. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`employee.operations@1` seeds one published Dunder Mifflin template; no fictional completed runs. `access.hcm2@1` grants read and manage to Toby. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-employee-import`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-documents): accept staged import source files`
- `feat(hcm-employee): add employee import contracts and persistence`
- `feat(hcm-employee): expose authorized employee import API`
- `feat(hcm-employee): add employee import native UI`
- `test(hcm-employee): verify employee import acceptance`
