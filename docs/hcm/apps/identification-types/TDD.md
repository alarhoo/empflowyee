# Identification Types — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/workforce-foundation/identification-types`; lazy feature `libs/hcm/web/workforce-foundation/feature-identification-types` (`hcm-web-workforce-foundation-feature-identification-types`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

Read `identification_type` joined to `country` into `IdentificationTypeDto`. The raw validation pattern stays server-side; a product-authored description is returned instead.

Query behavior: Client mode over the bounded product catalogue (maximum 500 rows). Search matches code and name; filters country and active; sort name then code.

## API

All DTOs and validation belong to `hcm-workforce-foundation-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/workforce-foundation/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/workforce-foundation`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                                     | Permission                                           | Request       | Response                         |
| --------------------------------------------- | ---------------------------------------------------- | ------------- | -------------------------------- |
| `GET /identification-types`                   | `hcm.workforce-foundation.identification-types.read` | None          | {items: IdentificationTypeDto[]} |
| `GET /identification-types/options/countries` | `hcm.workforce-foundation.identification-types.read` | List query: q | Page<ReferenceItemDto>           |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

No mutation. DEC-HCM2-016 keeps the catalogue product-owned; product changes ship as forward migrations.

## RULES

Product rows are inserted and changed only by migrations. Runtime has SELECT only. Retired product types remain visible as Inactive.

Domain invariants are in the [domain policy](../../domains/workforce-foundation/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/workforce-foundation/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.workforce-foundation`. Discovery stays `hcm.catalogue.IDENTIFICATION_TYPES.discover` and is not a business permission.

| Business permission                                  | Authorized function                            |
| ---------------------------------------------------- | ---------------------------------------------- |
| `hcm.workforce-foundation.identification-types.read` | Read the product identification-type catalogue |

Subject scope: Tenant administration view of global product metadata; no person subject. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model   | Owner                | Use                                       |
| --------------------- | -------------------- | ----------------------------------------- |
| `identification_type` | workforce-foundation | global product table; runtime SELECT only |
| `country`             | workforce-foundation | global product table; runtime SELECT only |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-DYNAMIC-PAGE`, mode **NATIVE**. Single `HcmDynamicPage` titled Identification Types. The header holds Country (UI5 ComboBox) and Active (UI5 Select) filters in a native Form with `labelSpan="S12 M12 L12 XL12"`. The content is a client-mode UI5 Table.

Semantic controls: Active state uses inverted `ObjectStatusComponent` (Positive Active, Neutral Inactive). Yes/no characteristics use read-only UI5 CheckBox with accessible labels. Sorting uses shared `HcmViewSettings`.

Table declaration: Mode **client**, bounded to 500 rows. No row navigation because every property is visible in the row; Popin keeps the characteristics on narrow screens.

Forms: No forms in the current revision.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | DynamicPage, DynamicPageTitle, DynamicPageHeader, ViewSettingsDialog                                                                                              |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, Form, FormItem, Label, ComboBox, ComboBoxItem, Select, Option, CheckBox, MessageStrip, BusyIndicator |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                             |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                                     | Root                                                             | Tags                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `hcm-web-workforce-foundation-feature-identification-types` | `libs/hcm/web/workforce-foundation/feature-identification-types` | `product:hcm`, `runtime:web`, `domain:workforce-foundation`, `type:feature`        |
| `hcm-web-workforce-foundation-data-access`                  | `libs/hcm/web/workforce-foundation/data-access`                  | `product:hcm`, `runtime:web`, `domain:workforce-foundation`, `type:data-access`    |
| `hcm-workforce-foundation-contract`                         | `libs/hcm/contracts/workforce-foundation`                        | `product:hcm`, `runtime:universal`, `domain:workforce-foundation`, `type:contract` |
| `hcm-api-workforce-foundation-domain`                       | `libs/hcm/api/workforce-foundation/domain`                       | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:domain`         |
| `hcm-api-workforce-foundation-application`                  | `libs/hcm/api/workforce-foundation/application`                  | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:application`    |
| `hcm-api-workforce-foundation-infrastructure`               | `libs/hcm/api/workforce-foundation/infrastructure`               | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:infrastructure` |
| `hcm-api-workforce-foundation-transport`                    | `libs/hcm/api/workforce-foundation/transport`                    | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:transport`      |
| `hcm-api-workforce-foundation-module`                       | `libs/hcm/api/workforce-foundation/module`                       | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Reference-data migration `000017` with product rows. No cross-domain port.

| Prerequisite               | State    | Note                                     |
| -------------------------- | -------- | ---------------------------------------- |
| `hcm2-shared-contract`     | resolved | Shared HCM-2 design complete for review. |
| `hcm2-physical-model`      | resolved | Shared HCM-2 design complete for review. |
| `hcm2-permission-register` | resolved | Shared HCM-2 design complete for review. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

Product rows ship in the migration, not a development seed. `access.hcm2@1` grants read to David and Toby. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-identification-types`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-workforce): add identification type reference contract and API`
- `feat(hcm-workforce): add identification types native UI`
- `test(hcm-workforce): verify identification types acceptance`
