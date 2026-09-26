# Lookup Values — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/workforce-foundation/lookup-values`; lazy feature `libs/hcm/web/workforce-foundation/feature-lookup-values` (`hcm-web-workforce-foundation-feature-lookup-values`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

Set metadata is a product-owned constant list mapped to tables. Values are read per set into `LookupValueDto` with a closed attributes object per set.

Query behavior: Sets are a bounded client collection of eight. Values are server mode: q matches code and name; active filter; sort sortOrder then name then id.

## API

All DTOs and validation belong to `hcm-workforce-foundation-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/workforce-foundation/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/workforce-foundation`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                                       | Permission                                | Request                                                              | Response                |
| ----------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- | ----------------------- |
| `GET /lookup-sets`                              | `hcm.workforce-foundation.lookups.read`   | None                                                                 | {items: LookupSetDto[]} |
| `GET /lookup-sets/{setKey}/values`              | `hcm.workforce-foundation.lookups.read`   | List query: q?, active?                                              | Page<LookupValueDto>    |
| `POST /lookup-sets/{setKey}/values`             | `hcm.workforce-foundation.lookups.manage` | {code, name, description?, sortOrder, attributes, reason}            | LookupValueDto          |
| `PUT /lookup-sets/{setKey}/values/{id}`         | `hcm.workforce-foundation.lookups.manage` | {name, description, sortOrder, attributes, expectedRevision, reason} | LookupValueDto          |
| `POST /lookup-sets/{setKey}/values/{id}/active` | `hcm.workforce-foundation.lookups.manage` | {active, expectedRevision, reason}                                   | LookupValueDto          |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Create, edit and active-toggle run under the tenant lock with expected revision, reason and idempotency key, then append an audit event with the set key, value ID and changed field names.

## RULES

Codes are immutable. Runtime column grants exclude `code` from UPDATE. Unique `(tenant_id, lower(code))` per table. Worker event category is a product enum. `requires_approval` is not editable here; the employment-change approval policy owns it.

Domain invariants are in the [domain policy](../../domains/workforce-foundation/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/workforce-foundation/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.workforce-foundation`. Discovery stays `hcm.catalogue.LOOKUP_VALUES.discover` and is not a business permission.

| Business permission                       | Authorized function                                      |
| ----------------------------------------- | -------------------------------------------------------- |
| `hcm.workforce-foundation.lookups.read`   | Read tenant and product lookup sets                      |
| `hcm.workforce-foundation.lookups.manage` | Create, edit, retire and reactivate tenant lookup values |

Subject scope: Tenant configuration; no person subject. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model         | Owner                | Use                                                 |
| --------------------------- | -------------------- | --------------------------------------------------- |
| `worker_type`               | workforce-foundation | tenant-owned; runtime SELECT, INSERT, column UPDATE |
| `employment_end_reason`     | workforce-foundation | tenant-owned; runtime SELECT, INSERT, column UPDATE |
| `worker_event_type`         | workforce-foundation | tenant-owned; runtime SELECT, INSERT, column UPDATE |
| `gender`                    | workforce-foundation | global product; SELECT only                         |
| `marital_status`            | workforce-foundation | global product; SELECT only                         |
| `relationship_type`         | workforce-foundation | global product; SELECT only                         |
| `country`                   | workforce-foundation | global product; SELECT only                         |
| `currency`                  | workforce-foundation | global product; SELECT only                         |
| `workforce_command_receipt` | workforce-foundation | idempotency receipts                                |
| `audit_event`               | audit                | append through the audit port                       |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin column: `HcmDynamicPage` titled Lookup Values with a UI5 List of sets grouped by ownership. Mid column: `HcmDynamicPage` titled with the set name, Add value action and the values table. Create, edit and retire/reactivate use native Dialogs. Close and Maximize sit in the mid column title toolbar.

Semantic controls: Active uses inverted ObjectStatus. Statutory class and event category use UI5 Select. Eligibility flags use UI5 CheckBox. Sort order uses UI5 StepInput. Description uses UI5 TextArea. Reason uses UI5 TextArea (required, ≤500).

Table declaration: Values: mode **server**, cursor pages of 25 (max 100), growing button. No row navigation; row actions Edit and Retire/Reactivate are independent buttons.

Forms: Signal Forms per dialog. Code only on create. Client validation mirrors length and pattern; uniqueness is server-authoritative.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader, ViewSettingsDialog                                                                                                                                                                                           |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, List, ListItemStandard, ListItemGroup, Input, TextArea, Select, Option, CheckBox, StepInput |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                                                                                |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                              | Root                                                      | Tags                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `hcm-web-workforce-foundation-feature-lookup-values` | `libs/hcm/web/workforce-foundation/feature-lookup-values` | `product:hcm`, `runtime:web`, `domain:workforce-foundation`, `type:feature`        |
| `hcm-web-workforce-foundation-data-access`           | `libs/hcm/web/workforce-foundation/data-access`           | `product:hcm`, `runtime:web`, `domain:workforce-foundation`, `type:data-access`    |
| `hcm-workforce-foundation-contract`                  | `libs/hcm/contracts/workforce-foundation`                 | `product:hcm`, `runtime:universal`, `domain:workforce-foundation`, `type:contract` |
| `hcm-api-workforce-foundation-domain`                | `libs/hcm/api/workforce-foundation/domain`                | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:domain`         |
| `hcm-api-workforce-foundation-application`           | `libs/hcm/api/workforce-foundation/application`           | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:application`    |
| `hcm-api-workforce-foundation-infrastructure`        | `libs/hcm/api/workforce-foundation/infrastructure`        | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:infrastructure` |
| `hcm-api-workforce-foundation-transport`             | `libs/hcm/api/workforce-foundation/transport`             | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:transport`      |
| `hcm-api-workforce-foundation-module`                | `libs/hcm/api/workforce-foundation/module`                | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Migrations `000017` and `000019`. Consumers (Employee Records, Employment Changes) read lookups through `WorkforceReadPort` option queries.

| Prerequisite               | State    | Note                                     |
| -------------------------- | -------- | ---------------------------------------- |
| `hcm2-shared-contract`     | resolved | Shared HCM-2 design complete for review. |
| `hcm2-physical-model`      | resolved | Shared HCM-2 design complete for review. |
| `hcm2-permission-register` | resolved | Shared HCM-2 design complete for review. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`workforce.foundation@3` seeds Dunder Mifflin worker types (Employee, Contractor, Intern), end reasons and event types. `access.hcm2@1` grants read to David and Toby and manage to David. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-lookup-values`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-workforce): add lookup value contracts and persistence`
- `feat(hcm-workforce): expose authorized lookup values API`
- `feat(hcm-workforce): add lookup values native UI`
- `test(hcm-workforce): verify lookup values acceptance`
