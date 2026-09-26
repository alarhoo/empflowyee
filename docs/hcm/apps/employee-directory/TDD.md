# Employee Directory — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/employee/employee-directory`; lazy feature `libs/hcm/web/employee/feature-employee-directory` (`hcm-web-employee-feature-employee-directory`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

The directory query joins current assignments at `asOf` today and applies search only to searchable fields whose effective visibility is Organization. `ProfileFieldVisibilityPort` computes the allowlist once per request and per worker preference set.

Query behavior: Server mode. q matches normalized name (contains), work email and worker number (prefix); filters unitId, departmentId, locationId, designationId; sort name asc/desc then id. Cursor pages of 25, max 100.

## API

All DTOs and validation belong to `hcm-employee-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/employee/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/employee`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                           | Permission                    | Request                                                         | Response                 |
| ----------------------------------- | ----------------------------- | --------------------------------------------------------------- | ------------------------ |
| `GET /directory`                    | `hcm.employee.directory.read` | List query: unitId?, departmentId?, locationId?, designationId? | Page<DirectoryEntryDto>  |
| `GET /directory/{workerId}`         | `hcm.employee.directory.read` | None                                                            | DirectoryPersonDto       |
| `GET /directory/{workerId}/reports` | `hcm.employee.directory.read` | List query                                                      | Page<DirectoryEntryDto>  |
| `GET /directory/options/{kind}`     | `hcm.employee.directory.read` | List query: q                                                   | Page<StructureOptionDto> |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Read-only app.

## RULES

Search predicates are built from the allowlist, so a hidden field is never matched. Minimal spine rows appear only if they have a current assignment row with effective dates; otherwise they are excluded.

Domain invariants are in the [domain policy](../../domains/employee/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/employee/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.employee`. Discovery stays `hcm.catalogue.EMPLOYEE_DIRECTORY.discover` and is not a business permission.

| Business permission           | Authorized function                                |
| ----------------------------- | -------------------------------------------------- |
| `hcm.employee.directory.read` | Search and read the organisation-visible directory |

Subject scope: Organization scope: directory-eligible workers and Organization-visible fields only. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model             | Owner                | Use                            |
| ------------------------------- | -------------------- | ------------------------------ |
| `person`                        | workforce-foundation | read through WorkforceReadPort |
| `worker`                        | workforce-foundation | read                           |
| `employment`                    | workforce-foundation | read                           |
| `assignment`                    | workforce-foundation | read                           |
| `reporting_line`                | workforce-foundation | read                           |
| `designation`                   | workforce-foundation | read                           |
| `department`                    | workforce-foundation | read                           |
| `organisation`                  | workforce-foundation | read                           |
| `location`                      | workforce-foundation | read                           |
| `profile_field_tenant_policy`   | employee             | read                           |
| `profile_visibility_preference` | employee             | read                           |
| `custom_field_value`            | employee             | read DirectorySafe values only |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin: `HcmDynamicPage` titled Employee Directory with a search Input and filter ComboBoxes in the header and the results table. Mid: `HcmObjectPage` with Overview, Reporting and Additional information sections. Selection route `/employee/employee-directory/:workerId`.

Semantic controls: Avatar initials with name; work email as UI5 Link `mailto:`; manager and reports as UI5 Link to directory entries; filters as UI5 ComboBox with server filtering; sorting through `HcmViewSettings`.

Table declaration: Mode **server**, 25 per page, growing, whole-row navigation; Popin keeps department and location on narrow screens.

Forms: No forms.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader, ViewSettingsDialog                                                                                                               |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Avatar, Link, Input, ComboBox, ComboBoxItem, Form, FormItem, Label, Text, Title, Toolbar, Button, MessageStrip, BusyIndicator |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                       | Root                                               | Tags                                                                   |
| --------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| `hcm-web-employee-feature-employee-directory` | `libs/hcm/web/employee/feature-employee-directory` | `product:hcm`, `runtime:web`, `domain:employee`, `type:feature`        |
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

Workforce people and employment foundation; Employee profile policy foundation.

| Prerequisite               | State      | Note                                     |
| -------------------------- | ---------- | ---------------------------------------- |
| `hcm2-shared-contract`     | resolved   | Shared HCM-2 design complete for review. |
| `hcm2-physical-model`      | resolved   | Shared HCM-2 design complete for review. |
| `hcm2-permission-register` | resolved   | Shared HCM-2 design complete for review. |
| `employee-field-policy`    | unresolved | Profile policy foundation implemented.   |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`workforce.foundation@3` adds fictional colleagues. `access.hcm2@1` grants read to all four personas. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-employee-directory`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-employee): add directory projection contracts and queries`
- `feat(hcm-employee): expose authorized directory API`
- `feat(hcm-employee): add employee directory native UI`
- `test(hcm-employee): verify employee directory acceptance`
