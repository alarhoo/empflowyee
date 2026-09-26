# My Profile — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/employee/my-profile`; lazy feature `libs/hcm/web/employee/feature-my-profile` (`hcm-web-employee-feature-my-profile`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

Resolve the person and worker from the account linkage. Assemble `MyProfileDto` from Workforce facts and Employee custom values through the Self allowlist, with an `editMode` per field.

Query behavior: Singleton profile read. Emergency contacts and dependants are a bounded client collection (maximum 20).

## API

All DTOs and validation belong to `hcm-employee-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/employee/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/employee`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                                         | Permission                         | Request                                                                                                            | Response               |
| ------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `GET /me/profile`                                 | `hcm.employee.profile.self.read`   | None                                                                                                               | MyProfileDto           |
| `PUT /me/profile/personal`                        | `hcm.employee.profile.self.manage` | {preferredName?, bloodGroup?, expectedRevision}                                                                    | MyProfileDto           |
| `POST /me/profile/contact-points`                 | `hcm.employee.profile.self.manage` | {type, value}                                                                                                      | MyProfileDto           |
| `PUT /me/profile/contact-points/{id}`             | `hcm.employee.profile.self.manage` | {value, primary, expectedRevision}                                                                                 | MyProfileDto           |
| `POST /me/profile/contact-points/{id}/deactivate` | `hcm.employee.profile.self.manage` | {expectedRevision}                                                                                                 | MyProfileDto           |
| `POST /me/profile/relationships`                  | `hcm.employee.profile.self.manage` | {relationshipType, fullName, birthDate?, gender?, contactNumber?, dependent, emergencyContact, emergencyPriority?} | MyProfileDto           |
| `PUT /me/profile/relationships/{id}`              | `hcm.employee.profile.self.manage` | {same fields, expectedRevision}                                                                                    | MyProfileDto           |
| `POST /me/profile/relationships/{id}/deactivate`  | `hcm.employee.profile.self.manage` | {expectedRevision}                                                                                                 | MyProfileDto           |
| `PUT /me/profile/custom-fields/{fieldId}`         | `hcm.employee.profile.self.manage` | {value, expectedRevision?}                                                                                         | MyProfileDto           |
| `PUT /me/profile/visibility/{fieldRef}`           | `hcm.employee.profile.self.manage` | {visibility\|null, expectedRevision?}                                                                              | MyProfileDto           |
| `GET /me/profile/options/{kind}`                  | `hcm.employee.profile.self.read`   | List query: q                                                                                                      | Page<ReferenceItemDto> |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Each edit is its own command with expected revision and idempotency key. Workforce-owned facts change through `WorkforceFactsPort` in the Employee unit of work. Audit records field names only.

## RULES

Edit mode is re-evaluated server-side for every command. Personal contacts are stored with `is_verified=false`. Sensitive or Restricted custom values are rejected until the field-encryption ADR is accepted.

Domain invariants are in the [domain policy](../../domains/employee/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/employee/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.employee`. Discovery stays `hcm.catalogue.MY_PROFILE.discover` and is not a business permission.

| Business permission                | Authorized function                              |
| ---------------------------------- | ------------------------------------------------ |
| `hcm.employee.profile.self.read`   | Read own profile                                 |
| `hcm.employee.profile.self.manage` | Edit own Direct self-edit fields and preferences |

Subject scope: Self scope from the verified account’s person and worker. No subject ID is accepted. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model             | Owner                | Use                                                                          |
| ------------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `person`                        | workforce-foundation | write preferred name, blood group and search text through WorkforceFactsPort |
| `person_contact_point`          | workforce-foundation | write through WorkforceFactsPort                                             |
| `person_relationship`           | workforce-foundation | write through WorkforceFactsPort                                             |
| `person_address`                | workforce-foundation | read                                                                         |
| `employment`                    | workforce-foundation | read                                                                         |
| `assignment`                    | workforce-foundation | read                                                                         |
| `reporting_line`                | workforce-foundation | read                                                                         |
| `custom_field_value`            | employee             | owned                                                                        |
| `profile_visibility_preference` | employee             | owned                                                                        |
| `employee_command_receipt`      | employee             | idempotency receipts                                                         |
| `audit_event`                   | audit                | append through the audit port                                                |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-OBJECT-PAGE`, mode **COMPOSED**. Composed `HcmObjectPage` on its own route, titled with the display name, with Avatar initials and key info. Sections are Overview, Personal, Contact, Addresses, Emergency contacts and family, Employment, Additional information and Privacy. Each editable item uses a native Dialog. Correction actions deep-link to `/employee/my-hr-requests?new=personal-data-correction&field=<code>` when available.

Semantic controls: Personal email and phone use UI5 Link `mailto:`/`tel:` with a _Not verified_ informative ObjectStatus. Birth dates in family use UI5 DatePicker. Relationship type and gender use UI5 Select. Dependant and emergency flags use UI5 CheckBox. Priority uses UI5 StepInput. Preferences use UI5 Select limited to allowed values.

Table declaration: Emergency contacts and dependants: mode **client**, bounded to 20, row actions Edit and Remove.

Forms: Signal Forms per dialog; server authoritative for edit modes and uniqueness.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | DynamicPage, DynamicPageTitle, DynamicPageHeader                                                                                                                                                                                                                             |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, TabContainer, Tab, Avatar, Link, Input, TextArea, Select, Option, CheckBox, StepInput, DatePicker |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                                                                        |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                               | Root                                       | Tags                                                                   |
| ------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `hcm-web-employee-feature-my-profile` | `libs/hcm/web/employee/feature-my-profile` | `product:hcm`, `runtime:web`, `domain:employee`, `type:feature`        |
| `hcm-web-employee-data-access`        | `libs/hcm/web/employee/data-access`        | `product:hcm`, `runtime:web`, `domain:employee`, `type:data-access`    |
| `hcm-employee-contract`               | `libs/hcm/contracts/employee`              | `product:hcm`, `runtime:universal`, `domain:employee`, `type:contract` |
| `hcm-api-employee-domain`             | `libs/hcm/api/employee/domain`             | `product:hcm`, `runtime:api`, `domain:employee`, `type:domain`         |
| `hcm-api-employee-application`        | `libs/hcm/api/employee/application`        | `product:hcm`, `runtime:api`, `domain:employee`, `type:application`    |
| `hcm-api-employee-infrastructure`     | `libs/hcm/api/employee/infrastructure`     | `product:hcm`, `runtime:api`, `domain:employee`, `type:infrastructure` |
| `hcm-api-employee-transport`          | `libs/hcm/api/employee/transport`          | `product:hcm`, `runtime:api`, `domain:employee`, `type:transport`      |
| `hcm-api-employee-module`             | `libs/hcm/api/employee/module`             | `product:hcm`, `runtime:api`, `domain:employee`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Workforce people foundation (`WorkforceFactsPort` person commands); Employee profile policy foundation.

| Prerequisite               | State    | Note                                                                                                                                                          |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hcm2-shared-contract`     | resolved | Shared HCM-2 design complete.                                                                                                                                 |
| `hcm2-physical-model`      | resolved | Shared HCM-2 design complete.                                                                                                                                 |
| `hcm2-permission-register` | resolved | Shared HCM-2 design complete.                                                                                                                                 |
| `employee-field-policy`    | resolved | Design resolved. Implemented in its [delivery step](../../roadmap/HCM-2-DESIGN-REVIEW.md#order) before this app ships: Profile policy foundation implemented. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`workforce.foundation@3` gives the four personas complete person records; no fictional emergency contacts. `access.hcm2@1` grants self read and manage to all four personas. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-my-profile`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-employee): add my profile contracts and commands`
- `feat(hcm-employee): expose authorized my profile API`
- `feat(hcm-employee): add my profile native UI`
- `test(hcm-employee): verify my profile acceptance`
