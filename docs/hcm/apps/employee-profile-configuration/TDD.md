# Employee Profile Configuration — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/employee/employee-profile-configuration`; lazy feature `libs/hcm/web/employee/feature-employee-profile-configuration` (`hcm-web-employee-feature-employee-profile-configuration`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

The catalogue merges product definitions, product defaults and tenant policy rows into `ProfileFieldDto`. The effective preview calls `ProfileFieldVisibilityPort` with each viewer relation.

Query behavior: Client mode over a bounded catalogue (maximum 500 standard plus custom fields). Search code and name; filters scope, section, sensitivity; sort section then sort order.

## API

All DTOs and validation belong to `hcm-employee-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/employee/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/employee`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                                                       | Permission                                  | Request                                                                                              | Response                   |
| --------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------- |
| `GET /profile-fields`                                           | `hcm.employee.profile-configuration.read`   | None                                                                                                 | {items: ProfileFieldDto[]} |
| `GET /profile-fields/{fieldRef}`                                | `hcm.employee.profile-configuration.read`   | None                                                                                                 | ProfileFieldDetailDto      |
| `PUT /profile-fields/{fieldRef}/tenant-policy/{context}`        | `hcm.employee.profile-configuration.manage` | {requiredness, visibility, selfEditMode, allowWorkerPreference, expectedRevision, reason}            | ProfileFieldDetailDto      |
| `POST /profile-fields/{fieldRef}/tenant-policy/{context}/reset` | `hcm.employee.profile-configuration.manage` | {expectedRevision, reason}                                                                           | ProfileFieldDetailDto      |
| `POST /custom-fields`                                           | `hcm.employee.profile-configuration.manage` | {code, name, description?, ownerScope, dataType, sensitivity, section, searchable, options?, reason} | ProfileFieldDetailDto      |
| `PUT /custom-fields/{id}`                                       | `hcm.employee.profile-configuration.manage` | {name, description, section, sortOrder, active, expectedRevision, reason}                            | ProfileFieldDetailDto      |
| `POST /custom-fields/{id}/options`                              | `hcm.employee.profile-configuration.manage` | {code, name, sortOrder, expectedRevision, reason}                                                    | ProfileFieldDetailDto      |
| `PUT /custom-fields/{id}/options/{optionId}`                    | `hcm.employee.profile-configuration.manage` | {name, sortOrder, active, expectedRevision, reason}                                                  | ProfileFieldDetailDto      |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Policy edits insert a new tenant policy row with `effective_from_at` and close the previous one, keeping history. Custom field create, edit and option changes are revisioned and audited with field names only.

## RULES

CHECK constraints and the application reject widening beyond the ceiling. `requires_verification` stays false in HCM-2 because no verification channel exists. Sensitive and Restricted custom fields may be defined, but consuming apps store their values only after the field-encryption ADR is accepted.

Domain invariants are in the [domain policy](../../domains/employee/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/employee/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.employee`. Discovery stays `hcm.catalogue.EMPLOYEE_PROFILE_CONFIGURATION.discover` and is not a business permission.

| Business permission                         | Authorized function                                               |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `hcm.employee.profile-configuration.read`   | Read the product field catalogue, tenant policy and custom fields |
| `hcm.employee.profile-configuration.manage` | Narrow tenant policy and maintain custom fields                   |

Subject scope: Tenant configuration; no person subject. `fieldRef` is `standard:<code>` or `custom:<id>`. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model            | Owner    | Use                              |
| ------------------------------ | -------- | -------------------------------- |
| `profile_field_definition`     | employee | global product; SELECT only      |
| `profile_field_default_policy` | employee | global product; SELECT only      |
| `profile_field_tenant_policy`  | employee | owned                            |
| `custom_field_definition`      | employee | owned                            |
| `custom_field_option`          | employee | owned                            |
| `custom_field_value`           | employee | read for first-value checks only |
| `employee_command_receipt`     | employee | idempotency receipts             |
| `audit_event`                  | audit    | append through the audit port    |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin: `HcmDynamicPage` with a SegmentedButton scope (Standard, Custom), section and sensitivity filters and the field table. Mid: `HcmObjectPage` with Overview (ceiling and default), Tenant policy, Options (select types) and Effective visibility sections. Policy edits and option edits use Dialogs. New custom field uses the dedicated route `/employee/employee-profile-configuration/custom-fields/new`.

Semantic controls: Sensitivity and active use inverted ObjectStatus. Requiredness, visibility, edit mode, owner scope and data type use UI5 Select, with visibility options limited to the ceiling. Allow worker preference and searchable use UI5 CheckBox.

Table declaration: Fields: mode **client**, bounded to 500, whole-row navigation. Options: client, bounded to 200 per field.

Forms: Signal Forms. The custom field page validates code pattern and select options client-side; server enforces uniqueness and immutability.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader                                                                                                                                                                                                              |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, SegmentedButton, SegmentedButtonItem, Input, TextArea, Select, Option, CheckBox, StepInput |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                                                                               |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                                   | Root                                                           | Tags                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `hcm-web-employee-feature-employee-profile-configuration` | `libs/hcm/web/employee/feature-employee-profile-configuration` | `product:hcm`, `runtime:web`, `domain:employee`, `type:feature`        |
| `hcm-web-employee-data-access`                            | `libs/hcm/web/employee/data-access`                            | `product:hcm`, `runtime:web`, `domain:employee`, `type:data-access`    |
| `hcm-employee-contract`                                   | `libs/hcm/contracts/employee`                                  | `product:hcm`, `runtime:universal`, `domain:employee`, `type:contract` |
| `hcm-api-employee-domain`                                 | `libs/hcm/api/employee/domain`                                 | `product:hcm`, `runtime:api`, `domain:employee`, `type:domain`         |
| `hcm-api-employee-application`                            | `libs/hcm/api/employee/application`                            | `product:hcm`, `runtime:api`, `domain:employee`, `type:application`    |
| `hcm-api-employee-infrastructure`                         | `libs/hcm/api/employee/infrastructure`                         | `product:hcm`, `runtime:api`, `domain:employee`, `type:infrastructure` |
| `hcm-api-employee-transport`                              | `libs/hcm/api/employee/transport`                              | `product:hcm`, `runtime:api`, `domain:employee`, `type:transport`      |
| `hcm-api-employee-module`                                 | `libs/hcm/api/employee/module`                                 | `product:hcm`, `runtime:api`, `domain:employee`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Migration `000021`. This app’s foundation implements `ProfileFieldVisibilityPort` and `OrgChartFieldPolicy`, so it precedes every profile-consuming app.

| Prerequisite               | State    | Note                          |
| -------------------------- | -------- | ----------------------------- |
| `hcm2-shared-contract`     | resolved | Shared HCM-2 design complete. |
| `hcm2-physical-model`      | resolved | Shared HCM-2 design complete. |
| `hcm2-permission-register` | resolved | Shared HCM-2 design complete. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

Product catalogue rows ship in migration `000021`. `employee.profile@1` seeds any Dunder Mifflin narrowing. `access.hcm2@1` grants read to Toby and David, manage to Toby. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-employee-profile-configuration`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-employee): add profile field policy contracts and persistence`
- `feat(hcm-employee): expose authorized profile configuration API`
- `feat(hcm-employee): add profile configuration native UI`
- `test(hcm-employee): verify profile configuration acceptance`
