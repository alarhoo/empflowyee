# HCM-2 delivery progress

Status: **16 of 18 HCM-2 apps released; step 16 is complete.** Delivery follows the approved
[implementation order](HCM-2-DESIGN-REVIEW.md#order) under the
[implementation approval](HCM-2-IMPLEMENTATION-APPROVAL.md). An app becomes
`complete` in the canonical catalogue only after its implementation, tests and
validation record pass.

| Step  | Delivers                                                                                                                                        | State       | Evidence                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| 1     | Catalogue admission of Organization Structure                                                                                                   | Delivered   | 171-app catalogue; `access.discovery@2`                                            |
| 2     | Shared `HcmWizardPage`                                                                                                                          | Delivered   | [Validation](../ux/floorplans/validation.md#wizard-ux-fp-wizard-hcm-2-step-2)      |
| 3     | `FieldCipher` port and local key, with migration `000025`                                                                                       | Delivered   | [Validation](../testing/HCM-2-FIELD-CIPHER-VALIDATION.md)                          |
| 4     | Workforce structure foundation: migrations `000017`–`000018`, contracts, API, `workforce.foundation@2`, `access.hcm2@1`                         | Delivered   | `libs/hcm/api/workforce-foundation/**`; `pnpm hcm:db:test`                         |
| 5     | Organization Structure app                                                                                                                      | Released    | [Validation](../testing/HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md)                |
| 6     | Identification Types app                                                                                                                        | Released    | [Validation](../testing/HCM-2-IDENTIFICATION-TYPES-VALIDATION.md)                  |
| 7     | Workforce people foundation: migrations `000019`–`000020`, `WorkforceFactsPort`, reporting queries, `workforce.foundation@3`                    | Delivered   | [Validation](../testing/HCM-2-WORKFORCE-PEOPLE-FOUNDATION-VALIDATION.md)           |
| 8     | Lookup Values app, with grant migration `000021`                                                                                                | Released    | [Validation](../testing/HCM-2-LOOKUP-VALUES-VALIDATION.md)                         |
| 9     | Employee profile foundation: migration `000022`, `ProfileFieldVisibilityPort`, `OrgChartFieldPolicy`, `TeamScopeResolver`, `employee.profile@1` | Delivered   | [Validation](../testing/HCM-2-EMPLOYEE-PROFILE-FOUNDATION-VALIDATION.md)           |
| 10    | Employee Profile Configuration app                                                                                                              | Released    | [Validation](../testing/HCM-2-EMPLOYEE-PROFILE-CONFIGURATION-VALIDATION.md)        |
| 10    | Org Chart app                                                                                                                                   | Released    | [Validation](../testing/HCM-2-ORG-CHART-VALIDATION.md)                             |
| 10    | Employee Directory app                                                                                                                          | Released    | [Validation](../testing/HCM-2-EMPLOYEE-DIRECTORY-VALIDATION.md)                    |
| 10    | Team Directory app                                                                                                                              | Released    | [Validation](../testing/HCM-2-TEAM-DIRECTORY-VALIDATION.md)                        |
| 10    | My Profile app, with grant migration `000023`                                                                                                   | Released    | [Validation](../testing/HCM-2-MY-PROFILE-VALIDATION.md)                            |
| 11    | Job architecture catalogue foundation: migration `000024`, catalogue part of `job.architecture@1`                                               | Delivered   | [Validation](../testing/HCM-2-JOB-ARCHITECTURE-CATALOGUE-FOUNDATION-VALIDATION.md) |
| 11    | Job Catalogue app                                                                                                                               | Released    | [Validation](../testing/HCM-2-JOB-CATALOGUE-VALIDATION.md)                         |
| 12    | Positions foundation: migrations `000026`–`000027`, position ports, `job.architecture@2`                                                        | Delivered   | [Validation](../testing/HCM-2-POSITIONS-FOUNDATION-VALIDATION.md)                  |
| 12    | Positions app, with migration `000028` and `access.discovery@7`                                                                                 | Released    | [Validation](../testing/HCM-2-POSITIONS-VALIDATION.md)                             |
| 12    | Position Requirements app, with `access.discovery@8`                                                                                            | Released    | [Validation](../testing/HCM-2-POSITION-REQUIREMENTS-VALIDATION.md)                 |
| 13    | Employee Records app, including worker creation and merge                                                                                       | Released    | [Validation](../testing/HCM-2-EMPLOYEE-RECORDS-VALIDATION.md)                      |
| 14    | Workforce changes foundation: migration `000029`, facts and change-context ports, `workforce.foundation@4`                                      | Delivered   | [Validation](../testing/HCM-2-WORKFORCE-CHANGES-FOUNDATION-VALIDATION.md)          |
| 14    | Employment Changes app, with `access.discovery@9`                                                                                               | Released    | [Validation](../testing/HCM-2-EMPLOYMENT-CHANGES-VALIDATION.md)                    |
| 15    | Documents import-source extension: migration `000030`, `DocumentStoragePort`                                                                    | Delivered   | [Validation](../testing/HCM-2-DOCUMENTS-IMPORT-SOURCE-VALIDATION.md)               |
| 15    | Employee Import app, with migration `000031` and `employee.operations@1`                                                                        | Released    | [Validation](../testing/HCM-2-EMPLOYEE-IMPORT-VALIDATION.md)                       |
| 16    | Probation foundation: migration `000032`, `workforce.foundation@5`, `employee.operations@2`                                                     | Delivered   | [Validation](../testing/HCM-2-PROBATION-FOUNDATION-VALIDATION.md)                  |
| 16    | Probation Management app                                                                                                                        | Released    | [Validation](../testing/HCM-2-PROBATION-MANAGEMENT-VALIDATION.md)                  |
| 16    | Probation Review app                                                                                                                            | Released    | [Validation](../testing/HCM-2-PROBATION-REVIEW-VALIDATION.md)                      |
| 17    | Remaining foundations and apps                                                                                                                  | Not started | —                                                                                  |

Steps 1 and 4–8 were first delivered together on
`codex/hcm-2-catalogue-organization-structure`. Each step now also has its own branch,
stacked in order, and every later step starts a new branch from the previous one:

| Step | Branch                                              |
| ---- | --------------------------------------------------- |
| —    | `codex/hcm-1-foundation-and-hcm-2-design`           |
| 1    | `codex/hcm-2-catalogue-admission`                   |
| 4–5  | `codex/hcm-2-organization-structure`                |
| 6    | `codex/hcm-2-identification-types`                  |
| 7    | `codex/hcm-2-workforce-people-foundation`           |
| 8    | `codex/hcm-2-lookup-values`                         |
| 9    | `codex/hcm-2-employee-profile-foundation`           |
| 10   | `codex/hcm-2-employee-profile-configuration`        |
| 10   | `codex/hcm-2-org-chart`                             |
| 10   | `codex/hcm-2-employee-directory`                    |
| 10   | `codex/hcm-2-team-directory`                        |
| 10   | `codex/hcm-2-my-profile`                            |
| 11   | `codex/hcm-2-job-architecture-catalogue-foundation` |
| 11   | `codex/hcm-2-job-catalogue`                         |
| 3    | `codex/hcm-2-field-cipher`                          |
| 12   | `codex/hcm-2-job-architecture-positions-foundation` |
| 12   | `codex/hcm-2-positions`                             |
| 12   | `codex/hcm-2-position-requirements`                 |
| 2    | `codex/hcm-2-ux-wizard-floorplan`                   |
| 13   | `codex/hcm-2-employee-records`                      |
| 14   | `codex/hcm-2-employee-workforce-changes-foundation` |
| 14   | `codex/hcm-2-employment-changes`                    |
| 15   | `codex/hcm-2-documents-import-source`               |
| 15   | `codex/hcm-2-employee-import`                       |
| 16   | `codex/hcm-2-employee-probation-foundation`         |
| 16   | `codex/hcm-2-probation-management`                  |
| 16   | `codex/hcm-2-probation-review`                      |

Steps 4 and 5 share a branch because their commits are interleaved.

Migration numbers are assigned when a migration is added:

- Step 8 added `000021_workforce_lookup_values.sql`, which grants runtime UPDATE on the two
  lookup attribute columns that `000019` had withheld. The employee profile foundation of
  step 9 therefore became `000022`.
- My Profile in step 10 added `000023_employee_self_service.sql`, which grants the runtime the
  blood group, custom value and custom value option writes that `000022` had withheld.
- Step 3 was delivered after step 11 because the positions foundation needs it. It added
  `000025_field_cipher_keys.sql`.

The job architecture catalogue of step 11 therefore became `000024`, and the positions
migrations of step 12 became `000026`–`000027`, three above their planned numbers.

- The Positions app in step 12 added `000028_position_change_request_details.sql` for the
  proposed name and reporting line and the sealed withdrawal reason the approved API carries.
  Every later migration the approved plan numbers now takes the number four above its planned
  one: the workforce changes, import, probation and HR service migrations become
  `000029`–`000032`.
- The workforce changes foundation in step 14 is `000029_employee_workforce_changes.sql`. Its
  event types arrive as the forward seed `workforce.foundation@4`, because `workforce.foundation@3`
  is applied and immutable.
- The documents import-source extension in step 15 is `000030_document_import_sources.sql`; the
  employee import migration follows as `000031_employee_import.sql`, with its published template
  as the new seed module `employee.operations@1`.
- The probation foundation in step 16 is `000032_employee_probation.sql`, and the HR service
  migration follows as `000033`. Because `employee.operations@1` was applied with the import
  template, its planned probation and HR service content arrives as the forward modules
  `employee.operations@2` and `@3`; the probation event types arrive as `workforce.foundation@5`.

Seed modules are immutable once applied. `job.architecture@1` therefore carries only the
catalogue part delivered in step 11; the position part planned for it arrives in step 12 as
the forward module `job.architecture@2`.

## Implementation decisions

Decisions answered after design approval are recorded here, not in the
[decision register](HCM-2-DECISIONS.md), whose reviewed content hash every HCM-2
app approval binds.

| ID           | Question                                                                                                                                                                             | Answer (product owner, 2026-09-26)                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-HCM2-017 | The FDD names HR Operations as a reader of the organisation structure, but the reviewed seed granted Organization Structure discovery to Administration only. Should HR discover it? | Yes. `access.discovery@3` grants `hr-specialist` discovery, and the app joins the HR specialist catalogue under Workforce Operations. Discovery grants no business permission.                                                                                 |
| DEC-HCM2-018 | Identification Types and Lookup Values have the same gap: the FDDs name HR Operations as a reader, but discovery is Administration-only. Should HR discover them?                    | Yes. `access.discovery@4` grants `hr-specialist` discovery for both, and both join the HR specialist catalogue under Workforce Operations.                                                                                                                     |
| DEC-HCM2-019 | Employee Profile Configuration has the same gap: the FDD names tenant administrators as readers, but only HR could discover it. Should administrators discover it?                   | Yes, applied by the precedent of DEC-HCM2-017 and DEC-HCM2-018 without a separate product-owner answer. `access.discovery@5` grants `tenant-administrator` discovery, and the app joins the Tenant Administration catalogue under Reference Data and Policies. |
| DEC-HCM2-020 | Job Catalogue has the same gap: the FDD names HR Operations as a reader, but only administrators could discover it. Should HR discover it?                                           | Yes, applied by the precedent of DEC-HCM2-017 to DEC-HCM2-019 without a separate product-owner answer. `access.discovery@6` grants `hr-specialist` discovery, and the app joins the HR catalogue under Configuration and Service.                              |
| DEC-HCM2-021 | Positions has the same gap for approvers: tenant administrators decide position change requests but could not discover the app. Should they discover it?                             | Yes, applied by the precedent of DEC-HCM2-017 to DEC-HCM2-020 without a separate product-owner answer. `access.discovery@7` grants `tenant-administrator` discovery, and the app joins the Tenant Administration catalogue next to Job Catalogue.              |
| DEC-HCM2-022 | Position Requirements has the same gap: HR proposes requirement variances but only administrators could discover the app. Should HR discover it?                                     | Yes, applied by the precedent of DEC-HCM2-017 to DEC-HCM2-021 without a separate product-owner answer. `access.discovery@8` grants `hr-specialist` discovery, and the app joins the HR catalogue next to Positions.                                            |
| DEC-HCM2-023 | Employment Changes has the same gap for approvers: tenant administrators decide change requests but could not discover the app. Should they discover it?                             | Yes, applied by the precedent of DEC-HCM2-017 to DEC-HCM2-022 without a separate product-owner answer. `access.discovery@9` grants `tenant-administrator` discovery, and the app joins the Tenant Administration catalogue next to Positions.                  |

The open points found during step 5 are listed in the
[Organization Structure validation](../testing/HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#open-points).
