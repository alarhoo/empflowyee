# Organization Structure — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/workforce-foundation/organization-structure`; lazy feature `libs/hcm/web/workforce-foundation/feature-organization-structure` (`hcm-web-workforce-foundation-feature-organization-structure`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

Area queries map to their tables through infrastructure repositories. Unit trees use `organisation_version` at `asOf` with the parent index and materialized path. Usage counts come from assignments and `PositionReadPort` and are shown on detail only.

Query behavior: Units: tree children paged by 100 per parent at `asOf`. Other areas: server mode, q matches code and name, active filter, sort name then id. Legal entities and unit types are bounded client lists (maximum 200).

## API

All DTOs and validation belong to `hcm-workforce-foundation-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/workforce-foundation/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/workforce-foundation`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                             | Permission                                  | Request                                                                                                                                                | Response                 |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `GET /structure/organisation-profile` | `hcm.workforce-foundation.structure.read`   | None                                                                                                                                                   | OrganisationProfileDto   |
| `PUT /structure/organisation-profile` | `hcm.workforce-foundation.structure.manage` | {defaultTimeZone, defaultLanguage, defaultCurrency, financialYearStartMonth, financialYearStartDay, headquartersLocationId?, expectedRevision, reason} | OrganisationProfileDto   |
| `GET /structure/{area}`               | `hcm.workforce-foundation.structure.read`   | List query: active?, parentId?, asOf?                                                                                                                  | Page<StructureItemDto>   |
| `GET /structure/{area}/{id}`          | `hcm.workforce-foundation.structure.read`   | None                                                                                                                                                   | StructureItemDetailDto   |
| `POST /structure/{area}`              | `hcm.workforce-foundation.structure.manage` | {area fields, reason}                                                                                                                                  | StructureItemDetailDto   |
| `PUT /structure/{area}/{id}`          | `hcm.workforce-foundation.structure.manage` | {area fields, expectedRevision, reason}                                                                                                                | StructureItemDetailDto   |
| `POST /structure/{area}/{id}/active`  | `hcm.workforce-foundation.structure.manage` | {active, expectedRevision, reason}                                                                                                                     | StructureItemDetailDto   |
| `POST /structure/units/{id}/versions` | `hcm.workforce-foundation.structure.manage` | {effectiveFrom, typeId, parentId?, name, description?, legalEntityId?, primaryLocationId?, costCenterCode?, headWorkerId?, expectedRevision, reason}   | StructureItemDetailDto   |
| `POST /structure/units/{id}/retire`   | `hcm.workforce-foundation.structure.manage` | {effectiveTo, successorId?, expectedRevision, reason}                                                                                                  | StructureItemDetailDto   |
| `GET /structure/options/{kind}`       | `hcm.workforce-foundation.structure.manage` | List query: q                                                                                                                                          | Page<StructureOptionDto> |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Each command runs under the tenant lock with expected revision, reason and idempotency key and appends an audit event with IDs and changed field names. A new unit version closes the previous version the day before, recomputes the path and depth of the unit and its descendants in the same transaction, and fails on cycles.

## RULES

Codes are immutable after creation. Retirement and closure are blocked while current or future assignments, positions or child units reference the item. Designation has no grade, band or authority meaning. The organisation display name remains the Account-owned tenant projection. Legal-entity-bearing unit types must carry a legal entity; other units inherit it from their nearest bearing ancestor.

Domain invariants are in the [domain policy](../../domains/workforce-foundation/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/workforce-foundation/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.workforce-foundation`. Discovery stays `hcm.catalogue.ORGANIZATION_STRUCTURE.discover` and is not a business permission.

| Business permission                         | Authorized function                                   |
| ------------------------------------------- | ----------------------------------------------------- |
| `hcm.workforce-foundation.structure.read`   | Read organisation profile and all structure areas     |
| `hcm.workforce-foundation.structure.manage` | Create, change, retire and reactivate structure items |

Subject scope: Tenant configuration. `area` is legal-entities, unit-types, units, departments, designations or locations; `units` uses the dedicated version and retire endpoints for placement changes. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model         | Owner                | Use                                        |
| --------------------------- | -------------------- | ------------------------------------------ |
| `organisation_profile`      | workforce-foundation | owned                                      |
| `legal_entity`              | workforce-foundation | owned                                      |
| `organisation_unit_type`    | workforce-foundation | owned                                      |
| `organisation`              | workforce-foundation | owned; stable unit identity                |
| `organisation_version`      | workforce-foundation | owned                                      |
| `department`                | workforce-foundation | owned                                      |
| `designation`               | workforce-foundation | owned                                      |
| `location`                  | workforce-foundation | owned                                      |
| `country`                   | workforce-foundation | global product; SELECT only                |
| `currency`                  | workforce-foundation | global product; SELECT only                |
| `assignment`                | workforce-foundation | read usage counts                          |
| `position_version`          | job-architecture     | read usage counts through PositionReadPort |
| `workforce_command_receipt` | workforce-foundation | idempotency receipts                       |
| `audit_event`               | audit                | append through the audit port              |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout with three columns. Begin: `HcmDynamicPage` titled Organization Structure with a UI5 List of areas. Mid: `HcmDynamicPage` for the chosen area, with a table or, for units, an as-of DatePicker and a lazily expanded UI5 Tree. End: `HcmObjectPage` for the selected item with Overview, Versions (units, UI5 Timeline) and Usage sections. Units, legal entities and locations are created and edited on dedicated routes `/workforce-foundation/organization-structure/:area/:id/edit` because they have many fields. Unit types, departments, designations, the organisation profile and retire or reactivate use Dialogs.

Semantic controls: Active state uses inverted ObjectStatus. Dates use UI5 DatePicker. Entity type, location type, month and language use UI5 Select. Time zone, currency, country, parent, legal entity, location and head worker use UI5 ComboBox with server filtering. Target headcount and geofence radius use UI5 StepInput. Contact email and phone use UI5 Link when displayed.

Table declaration: Departments, designations and locations: mode **server**, 25 per page, growing, whole-row navigation. Legal entities and unit types: mode **client**, bounded to 200.

Forms: Signal Forms on dedicated pages and dialogs; server authoritative for hierarchy, uniqueness and usage checks.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader, Timeline, TimelineItem, ViewSettingsDialog                                                                                                                                                                                                              |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, List, ListItemStandard, Tree, TreeItem, Input, TextArea, Select, Option, ComboBox, ComboBoxItem, CheckBox, StepInput, DatePicker, Link |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                                                                                                                           |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                                       | Root                                                               | Tags                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `hcm-web-workforce-foundation-feature-organization-structure` | `libs/hcm/web/workforce-foundation/feature-organization-structure` | `product:hcm`, `runtime:web`, `domain:workforce-foundation`, `type:feature`        |
| `hcm-web-workforce-foundation-data-access`                    | `libs/hcm/web/workforce-foundation/data-access`                    | `product:hcm`, `runtime:web`, `domain:workforce-foundation`, `type:data-access`    |
| `hcm-workforce-foundation-contract`                           | `libs/hcm/contracts/workforce-foundation`                          | `product:hcm`, `runtime:universal`, `domain:workforce-foundation`, `type:contract` |
| `hcm-api-workforce-foundation-domain`                         | `libs/hcm/api/workforce-foundation/domain`                         | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:domain`         |
| `hcm-api-workforce-foundation-application`                    | `libs/hcm/api/workforce-foundation/application`                    | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:application`    |
| `hcm-api-workforce-foundation-infrastructure`                 | `libs/hcm/api/workforce-foundation/infrastructure`                 | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:infrastructure` |
| `hcm-api-workforce-foundation-transport`                      | `libs/hcm/api/workforce-foundation/transport`                      | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:transport`      |
| `hcm-api-workforce-foundation-module`                         | `libs/hcm/api/workforce-foundation/module`                         | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Workforce structure foundation (migrations `000017` and `000018`); `PositionReadPort` usage counts once positions exist; catalogue admission slice.

| Prerequisite               | State      | Note                                                                                         |
| -------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `hcm2-shared-contract`     | resolved   | Shared HCM-2 design complete for review.                                                     |
| `hcm2-physical-model`      | resolved   | Shared HCM-2 design complete for review.                                                     |
| `hcm2-permission-register` | resolved   | Shared HCM-2 design complete for review.                                                     |
| `catalogue-admission`      | unresolved | Canonical catalogue, launchpad, seed-generator and discovery-seed change admitting this app. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`workforce.foundation@2` seeds Dunder Mifflin structure. `access.hcm2@1` grants read to David and Toby and manage to David, plus the discovery grant for Administration. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-organization-structure`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-catalogue): admit Organization Structure to HCM-2`
- `feat(hcm-workforce): add organisation structure contracts and persistence`
- `feat(hcm-workforce): expose authorized organisation structure API`
- `feat(hcm-workforce): add organisation structure native UI`
- `test(hcm-workforce): verify organisation structure acceptance`
