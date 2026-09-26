# Team Directory — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/employee/team-directory`; lazy feature `libs/hcm/web/employee/feature-team-directory` (`hcm-web-employee-feature-team-directory`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

`TeamScopeResolver` returns worker IDs in scope; the member query reapplies them as a predicate inside the same transaction. Fields pass through the Manager allowlist.

Query behavior: Server mode, 25 per page. q matches name; filters locationId, probationStatus; sort name then id.

## API

All DTOs and validation belong to `hcm-employee-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/employee/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/employee`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation              | Permission               | Request                                   | Response                   |
| ---------------------- | ------------------------ | ----------------------------------------- | -------------------------- |
| `GET /team`            | `hcm.employee.team.read` | List query: locationId?, probationStatus? | Page<TeamMemberSummaryDto> |
| `GET /team/{workerId}` | `hcm.employee.team.read` | None                                      | TeamMemberDto              |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Read-only app. Probation Review links appear only when that app is discoverable and the actor is the assigned reviewer.

## RULES

Out-of-scope worker IDs return 404. Per DEC-HCM2-015, scope depth is one level and only primary solid lines count.

Domain invariants are in the [domain policy](../../domains/employee/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/employee/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.employee`. Discovery stays `hcm.catalogue.TEAM_DIRECTORY.discover` and is not a business permission.

| Business permission      | Authorized function                             |
| ------------------------ | ----------------------------------------------- |
| `hcm.employee.team.read` | Read team members within the DEC-HCM2-015 scope |

Subject scope: Team scope resolved by `TeamScopeResolver` under DEC-HCM2-015, recomputed per request. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model           | Owner                | Use                  |
| ----------------------------- | -------------------- | -------------------- |
| `reporting_line`              | workforce-foundation | read                 |
| `assignment`                  | workforce-foundation | read                 |
| `employment`                  | workforce-foundation | read                 |
| `worker`                      | workforce-foundation | read                 |
| `person`                      | workforce-foundation | read display columns |
| `profile_field_tenant_policy` | employee             | read                 |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin: `HcmDynamicPage` titled Team Directory with filters and table. Mid: `HcmObjectPage` with Overview, Employment and Probation sections.

Semantic controls: Employment and probation status use inverted ObjectStatus. Dates use the shared formatter. Work email uses UI5 Link `mailto:`.

Table declaration: Mode **server**, 25 per page, growing, whole-row navigation.

Forms: No forms.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader                                                                                                                                                   |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Avatar, Link, Input, ComboBox, ComboBoxItem, Select, Option, Form, FormItem, Label, Text, Title, Toolbar, Button, MessageStrip, BusyIndicator |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                    |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                   | Root                                           | Tags                                                                   |
| ----------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `hcm-web-employee-feature-team-directory` | `libs/hcm/web/employee/feature-team-directory` | `product:hcm`, `runtime:web`, `domain:employee`, `type:feature`        |
| `hcm-web-employee-data-access`            | `libs/hcm/web/employee/data-access`            | `product:hcm`, `runtime:web`, `domain:employee`, `type:data-access`    |
| `hcm-employee-contract`                   | `libs/hcm/contracts/employee`                  | `product:hcm`, `runtime:universal`, `domain:employee`, `type:contract` |
| `hcm-api-employee-domain`                 | `libs/hcm/api/employee/domain`                 | `product:hcm`, `runtime:api`, `domain:employee`, `type:domain`         |
| `hcm-api-employee-application`            | `libs/hcm/api/employee/application`            | `product:hcm`, `runtime:api`, `domain:employee`, `type:application`    |
| `hcm-api-employee-infrastructure`         | `libs/hcm/api/employee/infrastructure`         | `product:hcm`, `runtime:api`, `domain:employee`, `type:infrastructure` |
| `hcm-api-employee-transport`              | `libs/hcm/api/employee/transport`              | `product:hcm`, `runtime:api`, `domain:employee`, `type:transport`      |
| `hcm-api-employee-module`                 | `libs/hcm/api/employee/module`                 | `product:hcm`, `runtime:api`, `domain:employee`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Workforce employment and reporting foundation; Employee profile policy foundation.

| Prerequisite               | State      | Note                                     |
| -------------------------- | ---------- | ---------------------------------------- |
| `hcm2-shared-contract`     | resolved   | Shared HCM-2 design complete for review. |
| `hcm2-physical-model`      | resolved   | Shared HCM-2 design complete for review. |
| `hcm2-permission-register` | resolved   | Shared HCM-2 design complete for review. |
| `employee-field-policy`    | unresolved | Profile policy foundation implemented.   |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`workforce.foundation@3` places Jim, Dwight and Pam under Michael. `access.hcm2@1` grants team read to Michael. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-team-directory`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-employee): add team scope resolver and contracts`
- `feat(hcm-employee): expose authorized team directory API`
- `feat(hcm-employee): add team directory native UI`
- `test(hcm-employee): verify team directory acceptance`
