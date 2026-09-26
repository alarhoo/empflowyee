# Org Chart — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/workforce-foundation/org-chart`; lazy feature `libs/hcm/web/workforce-foundation/feature-org-chart` (`hcm-web-workforce-foundation-feature-org-chart`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

Queries run in one short verified transaction with a fixed `asOf` date. Roots and children use the `reporting_line` manager index. `OrgChartFieldPolicy` filters every person field before serialization. The path query is a bounded recursive CTE over current primary solid lines.

Query behavior: Children and roots: cursor pages of 50, sorted display name then assignment ID. Search: q ≥ 2 characters over `search_text` and worker number prefix; 25 per page.

## API

All DTOs and validation belong to `hcm-workforce-foundation-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/workforce-foundation/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/workforce-foundation`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                                     | Permission                                | Request                         | Response                   |
| --------------------------------------------- | ----------------------------------------- | ------------------------------- | -------------------------- |
| `GET /org-chart/roots`                        | `hcm.workforce-foundation.org-chart.read` | List query                      | Page<OrgChartNodeDto>      |
| `GET /org-chart/nodes/{assignmentId}`         | `hcm.workforce-foundation.org-chart.read` | None                            | OrgChartPersonDto          |
| `GET /org-chart/nodes/{assignmentId}/reports` | `hcm.workforce-foundation.org-chart.read` | List query                      | Page<OrgChartNodeDto>      |
| `GET /org-chart/nodes/{assignmentId}/path`    | `hcm.workforce-foundation.org-chart.read` | None                            | {items: OrgChartNodeDto[]} |
| `GET /org-chart/search`                       | `hcm.workforce-foundation.org-chart.read` | List query: q (required, 2–200) | Page<OrgChartNodeDto>      |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Read-only app. No mutation endpoints.

## RULES

Only employments whose status makes the worker currently engaged are included. Pending and Ended are excluded. Minimal spine rows without effective assignment dates are excluded and counted in a safe _incomplete records_ indicator for HR only, never for other viewers.

Domain invariants are in the [domain policy](../../domains/workforce-foundation/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/workforce-foundation/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.workforce-foundation`. Discovery stays `hcm.catalogue.ORG_CHART.discover` and is not a business permission.

| Business permission                       | Authorized function                               |
| ----------------------------------------- | ------------------------------------------------- |
| `hcm.workforce-foundation.org-chart.read` | Read the organisation-visible reporting hierarchy |

Subject scope: Organization scope: directory-eligible workers (open employment with a current assignment) and only fields whose effective visibility is Organization. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model           | Owner                | Use                                  |
| ----------------------------- | -------------------- | ------------------------------------ |
| `reporting_line`              | workforce-foundation | read                                 |
| `assignment`                  | workforce-foundation | read                                 |
| `employment`                  | workforce-foundation | read                                 |
| `worker`                      | workforce-foundation | read                                 |
| `person`                      | workforce-foundation | read display and search columns only |
| `designation`                 | workforce-foundation | read                                 |
| `organisation`                | workforce-foundation | read                                 |
| `organisation_version`        | workforce-foundation | read                                 |
| `department`                  | workforce-foundation | read                                 |
| `location`                    | workforce-foundation | read                                 |
| `profile_field_tenant_policy` | employee             | read through OrgChartFieldPolicy     |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin column: `HcmDynamicPage` titled Org Chart with a search Input in the header and a UI5 Tree using `hasChildren` and `ui5ItemToggle` for lazy expansion. Mid column: `HcmObjectPage` with Overview and Direct reports sections. Selection route `/workforce-foundation/org-chart/:assignmentId`.

Semantic controls: Person identity uses UI5 Avatar initials plus name. Work email uses UI5 Link `mailto:`. Manager and direct reports use UI5 Link to their node route. Read-only properties use UI5 Label and Text pairs.

Table declaration: Direct reports: mode **server**, 25 per page with growing, row click selects that node.

Forms: No forms.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader                                                                                                           |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Tree, TreeItem, Avatar, Link, Input, Label, Text, Title, Toolbar, Button, MessageStrip, BusyIndicator |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                          | Root                                                  | Tags                                                                               |
| ------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `hcm-web-workforce-foundation-feature-org-chart` | `libs/hcm/web/workforce-foundation/feature-org-chart` | `product:hcm`, `runtime:web`, `domain:workforce-foundation`, `type:feature`        |
| `hcm-web-workforce-foundation-data-access`       | `libs/hcm/web/workforce-foundation/data-access`       | `product:hcm`, `runtime:web`, `domain:workforce-foundation`, `type:data-access`    |
| `hcm-workforce-foundation-contract`              | `libs/hcm/contracts/workforce-foundation`             | `product:hcm`, `runtime:universal`, `domain:workforce-foundation`, `type:contract` |
| `hcm-api-workforce-foundation-domain`            | `libs/hcm/api/workforce-foundation/domain`            | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:domain`         |
| `hcm-api-workforce-foundation-application`       | `libs/hcm/api/workforce-foundation/application`       | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:application`    |
| `hcm-api-workforce-foundation-infrastructure`    | `libs/hcm/api/workforce-foundation/infrastructure`    | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:infrastructure` |
| `hcm-api-workforce-foundation-transport`         | `libs/hcm/api/workforce-foundation/transport`         | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:transport`      |
| `hcm-api-workforce-foundation-module`            | `libs/hcm/api/workforce-foundation/module`            | `product:hcm`, `runtime:api`, `domain:workforce-foundation`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Workforce employment and reporting foundation (migrations `000017`–`000020`). `OrgChartFieldPolicy` implemented by the Employee profile policy foundation (migration `000021`).

| Prerequisite               | State      | Note                                                                                     |
| -------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `hcm2-shared-contract`     | resolved   | Shared HCM-2 design complete for review.                                                 |
| `hcm2-physical-model`      | resolved   | Shared HCM-2 design complete for review.                                                 |
| `hcm2-permission-register` | resolved   | Shared HCM-2 design complete for review.                                                 |
| `employee-field-policy`    | unresolved | Employee profile policy foundation implements OrgChartFieldPolicy before this app ships. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`workforce.foundation@3` provides reporting lines for Dunder Mifflin. `access.hcm2@1` grants read to all four personas. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-org-chart`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-workforce): add org chart projection contract and queries`
- `feat(hcm-workforce): expose authorized org chart API`
- `feat(hcm-workforce): add org chart native UI`
- `test(hcm-workforce): verify org chart acceptance`
