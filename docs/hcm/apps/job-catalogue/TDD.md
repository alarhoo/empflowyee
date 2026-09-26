# Job Catalogue — technical design

Status: complete for review; no implementation or approval claimed.

## ROUTE

Selected route `/job-architecture/job-catalogue`; lazy feature `libs/hcm/web/job-architecture/feature-job-catalogue` (`hcm-web-job-architecture-feature-job-catalogue`).
The selection is recorded in the blueprint for review. The canonical catalogue route
and floorplan stay null, and implementationStatus stays planned, until this TDD is
approved. Catalogue placements remain navigation metadata and never determine
code ownership.

## READ

Version detail loads one version with bounded children (families paged by parent, at most 200 tracks, levels, bands and grades). Family tree uses the materialized path.

Query behavior: Versions: bounded list per catalogue. Profiles: server mode; q matches code and name; filters familyId, status; sort name then id.

## API

All DTOs and validation belong to `hcm-job-architecture-contract`. This table is normative together
with the [HCM-2 API rules](../../tdd/TDD-HCM-2-COMMON.md#api), the
[HCM-1 transport semantics](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#api) and the
[domain contract](../../domains/job-architecture/TECHNICAL-DESIGN.md#contract). Paths are relative
to `/api/v1/job-architecture`. No body or query field carries a tenant ID or an own-record subject ID.

| Operation                                                | Permission                               | Request                                                   | Response                       |
| -------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------- | ------------------------------ |
| `GET /catalogues`                                        | `hcm.job-architecture.catalogue.read`    | None                                                      | {items: CatalogueSummaryDto[]} |
| `GET /catalogue-versions/{id}`                           | `hcm.job-architecture.catalogue.read`    | None                                                      | CatalogueVersionDto            |
| `GET /catalogue-versions/{id}/families`                  | `hcm.job-architecture.catalogue.read`    | List query: parentId?                                     | Page<JobFamilyNodeDto>         |
| `POST /catalogues/{id}/versions`                         | `hcm.job-architecture.catalogue.manage`  | {basedOnVersionId, changeSummary, reason}                 | CatalogueVersionDto            |
| `POST /catalogue-versions/{id}/{elementKind}`            | `hcm.job-architecture.catalogue.manage`  | {element fields, expectedRevision, reason}                | CatalogueVersionDto            |
| `PUT /catalogue-versions/{id}/{elementKind}/{elementId}` | `hcm.job-architecture.catalogue.manage`  | {element fields, active, expectedRevision, reason}        | CatalogueVersionDto            |
| `POST /catalogue-versions/{id}/submit`                   | `hcm.job-architecture.catalogue.manage`  | {expectedRevision, reason}                                | CatalogueVersionDto            |
| `POST /catalogue-versions/{id}/publish`                  | `hcm.job-architecture.catalogue.publish` | {effectiveFrom, expectedRevision, reason}                 | CatalogueVersionDto            |
| `GET /profiles`                                          | `hcm.job-architecture.catalogue.read`    | List query: familyId?, status?                            | Page<JobProfileSummaryDto>     |
| `GET /profile-versions/{id}`                             | `hcm.job-architecture.catalogue.read`    | None                                                      | JobProfileVersionDto           |
| `POST /profiles`                                         | `hcm.job-architecture.catalogue.manage`  | {code, name, draft: JobProfileVersionDraft, reason}       | JobProfileVersionDto           |
| `POST /profiles/{id}/versions`                           | `hcm.job-architecture.catalogue.manage`  | {basedOnVersionId, reason}                                | JobProfileVersionDto           |
| `PUT /profile-versions/{id}`                             | `hcm.job-architecture.catalogue.manage`  | {draft: JobProfileVersionDraft, expectedRevision, reason} | JobProfileVersionDto           |
| `POST /profile-versions/{id}/submit`                     | `hcm.job-architecture.catalogue.manage`  | {expectedRevision, reason}                                | JobProfileVersionDto           |
| `POST /profile-versions/{id}/publish`                    | `hcm.job-architecture.catalogue.publish` | {effectiveFrom, expectedRevision, reason}                 | JobProfileVersionDto           |

Creation returns 201; other commands and reads return 200. The shared
400/401/403/404/409/413/415/423/503 classification applies. Every mutation requires
an `Idempotency-Key`; revisioned writes require `expectedRevision`. Operations not
listed are not permitted.

## ACTION

Draft element commands advance the version revision. Submit freezes editing. Publish sets the effective range, computes the source digest, closes the previous published version and moves the catalogue pointer in one transaction.

## RULES

Published immutability is enforced by trigger and runtime column grants. Per DEC-HCM2-005, family depth is at most two and `career_track.kind` is restricted to IndividualContributor or Management; each level carries name, sequence and scope summary. Per DEC-HCM2-006, one catalogue exists per tenant, enforced by a unique index on `job_catalogue(tenant_id)`. The initial grade set is four ordered bands (Entry, Professional, Senior, Leadership) with grades G1–G8, two per band; tenants rename or extend them through catalogue versions. Retired elements stay visible in the version where they were retired.

Domain invariants are in the [domain policy](../../domains/job-architecture/TECHNICAL-DESIGN.md#policy)
and [business rules](../../domains/job-architecture/BUSINESS-RULES.md).

## AUTH

Entitlement `hcm.job-architecture`. Discovery stays `hcm.catalogue.JOB_CATALOGUE.discover` and is not a business permission.

| Business permission                      | Authorized function                             |
| ---------------------------------------- | ----------------------------------------------- |
| `hcm.job-architecture.catalogue.read`    | Read catalogue versions and job profiles        |
| `hcm.job-architecture.catalogue.manage`  | Create and edit drafts; submit for review       |
| `hcm.job-architecture.catalogue.publish` | Publish reviewed catalogue and profile versions |

Subject scope: Tenant configuration; no person subject. `elementKind` is one of families, tracks, levels, bands, grades. Scopes are defined in the
[HCM-2 authorization contract](../../tdd/TDD-HCM-2-COMMON.md#auth) and granted by the
[permission register](../../tdd/HCM-2-PERMISSION-MATRIX.md). Authorization is
rechecked inside the unit of work. Cross-tenant or out-of-scope objects return 404;
a missing operation permission returns 403 before object lookup.

## DATA

| Table or read model                | Owner            | Use                           |
| ---------------------------------- | ---------------- | ----------------------------- |
| `job_catalogue`                    | job-architecture | owned                         |
| `job_catalogue_version`            | job-architecture | owned                         |
| `job_family`                       | job-architecture | owned                         |
| `career_track`                     | job-architecture | owned                         |
| `job_level`                        | job-architecture | owned                         |
| `job_band`                         | job-architecture | owned                         |
| `job_grade`                        | job-architecture | owned                         |
| `job_profile`                      | job-architecture | owned                         |
| `job_profile_version`              | job-architecture | owned                         |
| `job_profile_responsibility`       | job-architecture | owned                         |
| `job_profile_requirement`          | job-architecture | owned                         |
| `job_profile_grade`                | job-architecture | owned                         |
| `job_architecture_command_receipt` | job-architecture | idempotency receipts          |
| `audit_event`                      | audit            | append through the audit port |

Physical design, migration order, RLS and Kysely ownership follow the
[HCM-2 data model](../../tdd/TDD-HCM-2-DATA-MODEL.md#mapping). Cross-domain access uses
the [published ports](../../tdd/TDD-HCM-2-COMMON.md#ports); this app creates no
duplicate tables. Successful writes use the [shared unit of work](../../tdd/TDD-HCM-2-COMMON.md#tx).

## UX

Floorplan `UX-FP-FCL`, mode **NATIVE**. Native FlexibleColumnLayout. Begin column: `HcmDynamicPage` with a native scope SegmentedButton (Catalogue, Job profiles) and a table. Mid column: `HcmObjectPage`. For a catalogue version: Overview, Job families (UI5 Tree), Career tracks and levels, Bands and grades. For a profile version: Overview, Responsibilities, Requirements, Allowed grades, Versions (UI5 Timeline). New profile and profile draft editing use the dedicated route `/job-architecture/job-catalogue/profiles/:id/edit` with dirty-leave protection. Element edits and publish use Dialogs.

Semantic controls: Version and profile status use inverted ObjectStatus. Effective dates use UI5 DatePicker. Requirement type and quantity unit use UI5 Select; minimum quantity uses UI5 StepInput. Allowed grades use UI5 MultiComboBox and default grade a UI5 Select limited to the chosen grades. Statements and descriptions use UI5 TextArea.

Table declaration: Profiles: mode **server**, 25 per page, growing, whole-row navigation. Tracks, levels, bands and grades: mode **client** bounded to 200 per version.

Forms: Signal Forms for the profile page and every dialog. Server validation owns references and uniqueness.

Installed capability evidence is in the [HCM-2 inspection](../../tdd/TDD-HCM-2-COMMON.md#native):

| Package                                           | Imports                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fundamental-ngx/ui5-webcomponents-fiori` 0.64.3 | FlexibleColumnLayout, DynamicPage, DynamicPageTitle, DynamicPageHeader, Timeline, TimelineItem, ViewSettingsDialog                                                                                                                                                                                                                                |
| `@fundamental-ngx/ui5-webcomponents` 0.64.3       | Table, TableHeaderRow, TableHeaderCell, TableRow, TableCell, TableGrowing, Button, Toolbar, ToolbarButton, Bar, Title, Label, Text, MessageStrip, BusyIndicator, Dialog, Form, FormItem, Tree, TreeItem, SegmentedButton, SegmentedButtonItem, Input, TextArea, Select, Option, MultiComboBox, MultiComboBoxItem, StepInput, DatePicker, CheckBox |
| `@fundamental-ngx/core` 0.64.3                    | ObjectStatusComponent                                                                                                                                                                                                                                                                                                                             |

The feature is theme-agnostic: no feature CSS, theme imports, raw colors or deep
Shadow DOM styling. Every FCL column is page-backed with its own header. States
follow the [shared state model](../../tdd/TDD-HCM-1-LOCAL-COMMON.md#ux).

## PROJECTS

Planned project declarations; generate only when the owning slice is admitted.
Sibling apps reuse the domain's contract, data-access and API projects.

| Project                                          | Root                                                  | Tags                                                                           |
| ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `hcm-web-job-architecture-feature-job-catalogue` | `libs/hcm/web/job-architecture/feature-job-catalogue` | `product:hcm`, `runtime:web`, `domain:job-architecture`, `type:feature`        |
| `hcm-web-job-architecture-data-access`           | `libs/hcm/web/job-architecture/data-access`           | `product:hcm`, `runtime:web`, `domain:job-architecture`, `type:data-access`    |
| `hcm-job-architecture-contract`                  | `libs/hcm/contracts/job-architecture`                 | `product:hcm`, `runtime:universal`, `domain:job-architecture`, `type:contract` |
| `hcm-api-job-architecture-domain`                | `libs/hcm/api/job-architecture/domain`                | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:domain`         |
| `hcm-api-job-architecture-application`           | `libs/hcm/api/job-architecture/application`           | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:application`    |
| `hcm-api-job-architecture-infrastructure`        | `libs/hcm/api/job-architecture/infrastructure`        | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:infrastructure` |
| `hcm-api-job-architecture-transport`             | `libs/hcm/api/job-architecture/transport`             | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:transport`      |
| `hcm-api-job-architecture-module`                | `libs/hcm/api/job-architecture/module`                | `product:hcm`, `runtime:api`, `domain:job-architecture`, `type:module`         |

Application and domain layers contain no Kysely, HTTP or Nest types. Infrastructure
owns SQL and row mapping, transport owns validation, and the module composes
dependencies. The Angular feature depends on its own data-access, contracts and
approved floorplans only.

## DEPENDENCIES

Migration `000022`. Positions consume published profile versions through `PositionReadPort`.

| Prerequisite               | State    | Note                          |
| -------------------------- | -------- | ----------------------------- |
| `hcm2-shared-contract`     | resolved | Shared HCM-2 design complete. |
| `hcm2-physical-model`      | resolved | Shared HCM-2 design complete. |
| `hcm2-permission-register` | resolved | Shared HCM-2 design complete. |

Foundations HCM0-01 to HCM0-04 are referenced through their validation records.

## OPERATIONS

`job.architecture@1` seeds one published Dunder Mifflin catalogue: families Sales (Inside Sales, Account Management) and Corporate Services (Human Resources, Finance); Individual Contributor levels IC1–IC4 and Management levels M1–M3; bands Entry, Professional, Senior and Leadership with grades G1–G8. It also seeds example profiles. `access.hcm2@1` grants read to David and Toby, and manage and publish to David. Observability follows the [HCM-2 diagnostics rules](../../tdd/TDD-HCM-2-COMMON.md#obs).
Rollback follows the [shared operational rule](../../tdd/TDD-HCM-2-DATA-MODEL.md#rollback).

## TEST

[Traceability](TRACEABILITY.md) maps every requirement to a design section and a
planned test. Execution criteria follow the [HCM-2 proof obligations](../../tdd/TDD-HCM-2-COMMON.md#test).
No test is claimed executed by this design.

## DELIVERY

Branch `codex/hcm-2-job-catalogue`, cut after the domain foundations it depends on
are merged. Planned commits:

- `feat(hcm-job-architecture): add catalogue contracts and persistence`
- `feat(hcm-job-architecture): expose authorized catalogue API`
- `feat(hcm-job-architecture): add job catalogue native UI`
- `test(hcm-job-architecture): verify job catalogue acceptance`
