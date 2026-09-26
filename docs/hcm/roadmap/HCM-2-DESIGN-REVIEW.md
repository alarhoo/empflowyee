# HCM-2 design review

Status: **18 app design packages complete for review; no application code
implemented.** The product owner answered every business decision that blocked
an HCM-2 app on 2026-09-26; see the [decision register](HCM-2-DECISIONS.md#evidence).
Those answers are not approval of the documents written from them. Each package
still needs human review recorded in its `APPROVALS.json` before implementation.

## Review order

1. [HCM-2 scope](HCM-2-SCOPE.md) and [decision register](HCM-2-DECISIONS.md#decisions).
2. [Physical data model and migration plan](../tdd/TDD-HCM-2-DATA-MODEL.md), which
   reconciles the domain authority with the applied database spine.
3. [HCM-2 shared technical contract](../tdd/TDD-HCM-2-COMMON.md) and
   [permission register](../tdd/HCM-2-PERMISSION-MATRIX.md).
4. Domain technical designs:
   [Workforce Foundation](../domains/workforce-foundation/TECHNICAL-DESIGN.md),
   [Job Architecture](../domains/job-architecture/TECHNICAL-DESIGN.md),
   [Employee](../domains/employee/TECHNICAL-DESIGN.md), and the
   [Documents import-source addendum](../domains/documents/IMPORT-SOURCE-FILES.md).
5. [Field-encryption ADR](../adr/ADR-HCM-FIELD-ENCRYPTION.md), status Proposed.
6. The app packages below.

No new product boundary, deployable or tenant-isolation model is proposed. The
field-encryption ADR adds a Cloud KMS trust dependency for production, and the
Organization Structure app changes the canonical catalogue; both need explicit review.

## App packages

| App                              | Domain               | Review files                                                                                                                                                                                                                                                                                                          | Selected route                                 | Floorplan                    | Requirements |
| -------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------- | ------------ |
| `ORGANIZATION_STRUCTURE`         | workforce-foundation | [FDD](../apps/organization-structure/FDD.md) · [TDD](../apps/organization-structure/TDD.md) · [decisions](../apps/organization-structure/DECISIONS.md) · [tests](../apps/organization-structure/TRACEABILITY.md) · [blueprint](../apps/organization-structure/BLUEPRINT.json)                                         | `/workforce-foundation/organization-structure` | `UX-FP-FCL` NATIVE           | 9            |
| `IDENTIFICATION_TYPES`           | workforce-foundation | [FDD](../apps/identification-types/FDD.md) · [TDD](../apps/identification-types/TDD.md) · [decisions](../apps/identification-types/DECISIONS.md) · [tests](../apps/identification-types/TRACEABILITY.md) · [blueprint](../apps/identification-types/BLUEPRINT.json)                                                   | `/workforce-foundation/identification-types`   | `UX-FP-DYNAMIC-PAGE` NATIVE  | 5            |
| `LOOKUP_VALUES`                  | workforce-foundation | [FDD](../apps/lookup-values/FDD.md) · [TDD](../apps/lookup-values/TDD.md) · [decisions](../apps/lookup-values/DECISIONS.md) · [tests](../apps/lookup-values/TRACEABILITY.md) · [blueprint](../apps/lookup-values/BLUEPRINT.json)                                                                                      | `/workforce-foundation/lookup-values`          | `UX-FP-FCL` NATIVE           | 7            |
| `ORG_CHART`                      | workforce-foundation | [FDD](../apps/org-chart/FDD.md) · [TDD](../apps/org-chart/TDD.md) · [decisions](../apps/org-chart/DECISIONS.md) · [tests](../apps/org-chart/TRACEABILITY.md) · [blueprint](../apps/org-chart/BLUEPRINT.json)                                                                                                          | `/workforce-foundation/org-chart`              | `UX-FP-FCL` NATIVE           | 6            |
| `JOB_CATALOGUE`                  | job-architecture     | [FDD](../apps/job-catalogue/FDD.md) · [TDD](../apps/job-catalogue/TDD.md) · [decisions](../apps/job-catalogue/DECISIONS.md) · [tests](../apps/job-catalogue/TRACEABILITY.md) · [blueprint](../apps/job-catalogue/BLUEPRINT.json)                                                                                      | `/job-architecture/job-catalogue`              | `UX-FP-FCL` NATIVE           | 7            |
| `POSITIONS`                      | job-architecture     | [FDD](../apps/positions/FDD.md) · [TDD](../apps/positions/TDD.md) · [decisions](../apps/positions/DECISIONS.md) · [tests](../apps/positions/TRACEABILITY.md) · [blueprint](../apps/positions/BLUEPRINT.json)                                                                                                          | `/job-architecture/positions`                  | `UX-FP-FCL` NATIVE           | 8            |
| `POSITION_REQUIREMENTS`          | job-architecture     | [FDD](../apps/position-requirements/FDD.md) · [TDD](../apps/position-requirements/TDD.md) · [decisions](../apps/position-requirements/DECISIONS.md) · [tests](../apps/position-requirements/TRACEABILITY.md) · [blueprint](../apps/position-requirements/BLUEPRINT.json)                                              | `/job-architecture/position-requirements`      | `UX-FP-FCL` NATIVE           | 7            |
| `EMPLOYEE_PROFILE_CONFIGURATION` | employee             | [FDD](../apps/employee-profile-configuration/FDD.md) · [TDD](../apps/employee-profile-configuration/TDD.md) · [decisions](../apps/employee-profile-configuration/DECISIONS.md) · [tests](../apps/employee-profile-configuration/TRACEABILITY.md) · [blueprint](../apps/employee-profile-configuration/BLUEPRINT.json) | `/employee/employee-profile-configuration`     | `UX-FP-FCL` NATIVE           | 8            |
| `EMPLOYEE_DIRECTORY`             | employee             | [FDD](../apps/employee-directory/FDD.md) · [TDD](../apps/employee-directory/TDD.md) · [decisions](../apps/employee-directory/DECISIONS.md) · [tests](../apps/employee-directory/TRACEABILITY.md) · [blueprint](../apps/employee-directory/BLUEPRINT.json)                                                             | `/employee/employee-directory`                 | `UX-FP-FCL` NATIVE           | 6            |
| `TEAM_DIRECTORY`                 | employee             | [FDD](../apps/team-directory/FDD.md) · [TDD](../apps/team-directory/TDD.md) · [decisions](../apps/team-directory/DECISIONS.md) · [tests](../apps/team-directory/TRACEABILITY.md) · [blueprint](../apps/team-directory/BLUEPRINT.json)                                                                                 | `/employee/team-directory`                     | `UX-FP-FCL` NATIVE           | 4            |
| `MY_PROFILE`                     | employee             | [FDD](../apps/my-profile/FDD.md) · [TDD](../apps/my-profile/TDD.md) · [decisions](../apps/my-profile/DECISIONS.md) · [tests](../apps/my-profile/TRACEABILITY.md) · [blueprint](../apps/my-profile/BLUEPRINT.json)                                                                                                     | `/employee/my-profile`                         | `UX-FP-OBJECT-PAGE` COMPOSED | 8            |
| `EMPLOYEE_RECORDS`               | employee             | [FDD](../apps/employee-records/FDD.md) · [TDD](../apps/employee-records/TDD.md) · [decisions](../apps/employee-records/DECISIONS.md) · [tests](../apps/employee-records/TRACEABILITY.md) · [blueprint](../apps/employee-records/BLUEPRINT.json)                                                                       | `/employee/employee-records`                   | `UX-FP-FCL` NATIVE           | 10           |
| `EMPLOYEE_IMPORT`                | employee             | [FDD](../apps/employee-import/FDD.md) · [TDD](../apps/employee-import/TDD.md) · [decisions](../apps/employee-import/DECISIONS.md) · [tests](../apps/employee-import/TRACEABILITY.md) · [blueprint](../apps/employee-import/BLUEPRINT.json)                                                                            | `/employee/employee-import`                    | `UX-FP-FCL` NATIVE           | 8            |
| `EMPLOYMENT_CHANGES`             | employee             | [FDD](../apps/employment-changes/FDD.md) · [TDD](../apps/employment-changes/TDD.md) · [decisions](../apps/employment-changes/DECISIONS.md) · [tests](../apps/employment-changes/TRACEABILITY.md) · [blueprint](../apps/employment-changes/BLUEPRINT.json)                                                             | `/employee/employment-changes`                 | `UX-FP-FCL` NATIVE           | 8            |
| `PROBATION_MANAGEMENT`           | employee             | [FDD](../apps/probation-management/FDD.md) · [TDD](../apps/probation-management/TDD.md) · [decisions](../apps/probation-management/DECISIONS.md) · [tests](../apps/probation-management/TRACEABILITY.md) · [blueprint](../apps/probation-management/BLUEPRINT.json)                                                   | `/employee/probation-management`               | `UX-FP-FCL` NATIVE           | 7            |
| `PROBATION_REVIEW`               | employee             | [FDD](../apps/probation-review/FDD.md) · [TDD](../apps/probation-review/TDD.md) · [decisions](../apps/probation-review/DECISIONS.md) · [tests](../apps/probation-review/TRACEABILITY.md) · [blueprint](../apps/probation-review/BLUEPRINT.json)                                                                       | `/employee/probation-review`                   | `UX-FP-FCL` NATIVE           | 5            |
| `HR_SERVICE_DESK`                | employee             | [FDD](../apps/hr-service-desk/FDD.md) · [TDD](../apps/hr-service-desk/TDD.md) · [decisions](../apps/hr-service-desk/DECISIONS.md) · [tests](../apps/hr-service-desk/TRACEABILITY.md) · [blueprint](../apps/hr-service-desk/BLUEPRINT.json)                                                                            | `/employee/hr-service-desk`                    | `UX-FP-FCL` NATIVE           | 8            |
| `MY_HR_REQUESTS`                 | employee             | [FDD](../apps/my-hr-requests/FDD.md) · [TDD](../apps/my-hr-requests/TDD.md) · [decisions](../apps/my-hr-requests/DECISIONS.md) · [tests](../apps/my-hr-requests/TRACEABILITY.md) · [blueprint](../apps/my-hr-requests/BLUEPRINT.json)                                                                                 | `/employee/my-hr-requests`                     | `UX-FP-FCL` NATIVE           | 7            |

Every requirement maps one-to-one to a TDD section and a planned test (128
requirements in total). No test is claimed executed.

<a id="order"></a>

## ORDER — Implementation order

Shared foundations come before the apps that consume them. Each row is one
short-lived branch with coherent commits; no branch implements a whole domain's
apps at once.

| Step | Branch                                                                                                                                                          | Delivers                                                                                                                                                            | Unblocks                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1    | `codex/hcm-2-catalogue-organization-structure`                                                                                                                  | [Catalogue admission](#catalogue-admission) of Organization Structure                                                                                               | Organization Structure                                    |
| 2    | `codex/hcm-2-ux-wizard-floorplan`                                                                                                                               | Shared `HcmWizardPage` integration with native acceptance evidence                                                                                                  | Employee Records, Employee Import, Employment Changes     |
| 3    | `codex/hcm-2-field-cipher`                                                                                                                                      | `FieldCipher` port and local key handling after the encryption ADR is accepted                                                                                      | Positions, Position Requirements, sensitive custom values |
| 4    | `codex/hcm-2-workforce-structure-foundation`                                                                                                                    | Migrations `000017`–`000018`, workforce contract and API projects, structure read port, `workforce.foundation@2`, `access.hcm2@1` permission definitions and grants | Organization Structure, Identification Types              |
| 5    | `codex/hcm-2-organization-structure`                                                                                                                            | App                                                                                                                                                                 | Structure maintenance                                     |
| 6    | `codex/hcm-2-identification-types`                                                                                                                              | App                                                                                                                                                                 | —                                                         |
| 7    | `codex/hcm-2-workforce-people-foundation`                                                                                                                       | Migrations `000019`–`000020`, `WorkforceFactsPort`, occupancy and reporting queries, `workforce.foundation@3`                                                       | Every people-based app                                    |
| 8    | `codex/hcm-2-lookup-values`                                                                                                                                     | App                                                                                                                                                                 | —                                                         |
| 9    | `codex/hcm-2-employee-profile-foundation`                                                                                                                       | Migration `000021`, `ProfileFieldVisibilityPort`, `OrgChartFieldPolicy`, `TeamScopeResolver`, `employee.profile@1`                                                  | Profile-consuming apps                                    |
| 10   | `codex/hcm-2-employee-profile-configuration`, `codex/hcm-2-org-chart`, `codex/hcm-2-employee-directory`, `codex/hcm-2-team-directory`, `codex/hcm-2-my-profile` | Apps, one branch each                                                                                                                                               | —                                                         |
| 11   | `codex/hcm-2-job-architecture-catalogue-foundation` then `codex/hcm-2-job-catalogue`                                                                            | Migration `000022`, catalogue part of `job.architecture@1`; app                                                                                                     | Positions                                                 |
| 12   | `codex/hcm-2-job-architecture-positions-foundation` then `codex/hcm-2-positions`, `codex/hcm-2-position-requirements`                                           | Migrations `000023`–`000024`, `PositionReadPort`, position part of `job.architecture@1`; apps                                                                       | Employment Changes                                        |
| 13   | `codex/hcm-2-employee-records`                                                                                                                                  | App, including worker creation and merge                                                                                                                            | —                                                         |
| 14   | `codex/hcm-2-employee-workforce-changes-foundation` then `codex/hcm-2-employment-changes`                                                                       | Migration `000025`; app                                                                                                                                             | —                                                         |
| 15   | `codex/hcm-2-documents-import-source` then `codex/hcm-2-employee-import`                                                                                        | Documents extension and migration `000026`; app                                                                                                                     | —                                                         |
| 16   | `codex/hcm-2-employee-probation-foundation` then `codex/hcm-2-probation-management`, `codex/hcm-2-probation-review`                                             | Migration `000027`, part of `employee.operations@1`; apps                                                                                                           | —                                                         |
| 17   | `codex/hcm-2-employee-hr-service-foundation` then `codex/hcm-2-hr-service-desk`, `codex/hcm-2-my-hr-requests`                                                   | Migration `000028`, rest of `employee.operations@1`; apps; then enable the My Profile correction action                                                             | —                                                         |

Steps 2 and 3 can run in parallel with steps 4 to 10. Migration file numbers are
assigned at merge time in this order.

<a id="catalogue-admission"></a>

## CATALOGUE-ADMISSION — Admitting Organization Structure

DEC-HCM2-014 adds an app that the canonical catalogue does not yet contain.
Adding it touches metadata, generated projections, tests and seed tooling, so it
is delivered as its own implementation slice rather than in this design step.

1. Add this entry to `docs/hcm/catalogue/hcm-app-catalogue.json` with the standard
   planned-app fields: app code `ORGANIZATION_STRUCTURE`, title _Organization
   Structure_, domain `workforce-foundation`, wave HCM-2, catalogue
   `tenant-administration`, and feature path
   `libs/hcm/web/workforce-foundation/feature-organization-structure`. Discovery
   uses `hcm.catalogue.ORGANIZATION_STRUCTURE.discover` with entitlement
   `hcm.workforce-foundation`.
2. Place it first in the `admin-people-documents` section of the
   `admin-reference-data` page in `hcm-launchpad.json`, and add it to the
   workforce-foundation apps in `hcm-domain-catalogue.json` and
   `HCM-DOMAIN-CATALOGUE.md`.
3. Update the expected app count from 170 to 171 in
   `tools/hcm-factory/validate-catalogue.mjs`, the catalogue search and launchpad
   state unit tests, and the live catalogue-configuration browser test.
4. Keep the immutable `access.discovery@1` seed unchanged. Make
   `tools/hcm-database/generate-spine-seeds.mjs` emit version 1 only for the
   original 170 apps, so `pnpm hcm:db:seed:check` stays green. Deliver the new
   discovery permission and its tenant-administrator grant through a forward seed
   module.
5. Run `pnpm hcm:catalogue:generate`, `pnpm hcm:catalogue:check`,
   `pnpm hcm:catalogue:validate`, `pnpm hcm:db:seed:check` and the affected
   navigation tests.

Until this slice merges, readiness cannot evaluate the app against the canonical
catalogue. Its package was checked against the entry above in isolation; see below.

<a id="readiness"></a>

## READINESS — Gate results on 2026-09-26

Recorded after the decisions were applied. Commands:

```sh
pnpm hcm:wave:context --wave=HCM-2
pnpm hcm:app:readiness --app=<APP_CODE> --check
```

Result: **0 of 18 apps READY; 18 BLOCKED.** No app is blocked by an open business
decision, and no structural, reference or traceability error was reported.

Every app shares two blocking reasons:

- **Approval evidence.** No `APPROVALS.json` exists yet, so each registered
  document and the blueprint reports APPROVAL_REQUIRED. Human review must record
  the exact content hashes; these tools never create approvals.
- **Catalogue summary.** The canonical entry still has `fddStatus`, `tddStatus`
  and `blockingDecisionStatus` unset and `route` and `floorplan` null, so
  CATALOGUE_NOT_APPROVED, ROUTE_REQUIRED, FLOORPLAN_REQUIRED and the matching
  mismatch checks fail. They are updated only after the TDD is approved.

Additional technical prerequisites, each resolved by an earlier [ORDER](#order) step:

| App                              | Readiness | Unresolved technical prerequisites                        | Later-capability warnings |
| -------------------------------- | --------- | --------------------------------------------------------- | ------------------------- |
| `ORGANIZATION_STRUCTURE`         | BLOCKED   | catalogue admission                                       | 2                         |
| `IDENTIFICATION_TYPES`           | BLOCKED   | None                                                      | 1                         |
| `LOOKUP_VALUES`                  | BLOCKED   | None                                                      | 0                         |
| `ORG_CHART`                      | BLOCKED   | profile policy foundation                                 | 1                         |
| `JOB_CATALOGUE`                  | BLOCKED   | None                                                      | 2                         |
| `POSITIONS`                      | BLOCKED   | job catalogue foundation; field-encryption ADR accepted   | 1                         |
| `POSITION_REQUIREMENTS`          | BLOCKED   | position change foundation; field-encryption ADR accepted | 1                         |
| `EMPLOYEE_PROFILE_CONFIGURATION` | BLOCKED   | None                                                      | 1                         |
| `EMPLOYEE_DIRECTORY`             | BLOCKED   | profile policy foundation                                 | 1                         |
| `TEAM_DIRECTORY`                 | BLOCKED   | profile policy foundation                                 | 0                         |
| `MY_PROFILE`                     | BLOCKED   | profile policy foundation                                 | 1                         |
| `EMPLOYEE_RECORDS`               | BLOCKED   | shared wizard acceptance; profile policy foundation       | 2                         |
| `EMPLOYEE_IMPORT`                | BLOCKED   | shared wizard acceptance                                  | 1                         |
| `EMPLOYMENT_CHANGES`             | BLOCKED   | shared wizard acceptance; positions foundation            | 2                         |
| `PROBATION_MANAGEMENT`           | BLOCKED   | None                                                      | 1                         |
| `PROBATION_REVIEW`               | BLOCKED   | probation foundation                                      | 0                         |
| `HR_SERVICE_DESK`                | BLOCKED   | None                                                      | 1                         |
| `MY_HR_REQUESTS`                 | BLOCKED   | HR service foundation                                     | 0                         |

Organization Structure was evaluated against its pending catalogue entry because
the canonical catalogue does not contain it until the admission slice merges.
