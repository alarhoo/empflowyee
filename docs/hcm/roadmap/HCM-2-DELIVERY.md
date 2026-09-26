# HCM-2 delivery progress

Status: **2 of 18 HCM-2 apps released.** Delivery follows the approved
[implementation order](HCM-2-DESIGN-REVIEW.md#order) under the
[implementation approval](HCM-2-IMPLEMENTATION-APPROVAL.md). An app becomes
`complete` in the canonical catalogue only after its implementation, tests and
validation record pass.

| Step | Delivers                                                                                                                     | State       | Evidence                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| 1    | Catalogue admission of Organization Structure                                                                                | Delivered   | 171-app catalogue; `access.discovery@2`                                  |
| 2    | Shared `HcmWizardPage`                                                                                                       | Not started | —                                                                        |
| 3    | `FieldCipher` port and local key                                                                                             | Not started | —                                                                        |
| 4    | Workforce structure foundation: migrations `000017`–`000018`, contracts, API, `workforce.foundation@2`, `access.hcm2@1`      | Delivered   | `libs/hcm/api/workforce-foundation/**`; `pnpm hcm:db:test`               |
| 5    | Organization Structure app                                                                                                   | Released    | [Validation](../testing/HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md)      |
| 6    | Identification Types app                                                                                                     | Released    | [Validation](../testing/HCM-2-IDENTIFICATION-TYPES-VALIDATION.md)        |
| 7    | Workforce people foundation: migrations `000019`–`000020`, `WorkforceFactsPort`, reporting queries, `workforce.foundation@3` | Delivered   | [Validation](../testing/HCM-2-WORKFORCE-PEOPLE-FOUNDATION-VALIDATION.md) |
| 8–17 | Remaining foundations and apps                                                                                               | Not started | —                                                                        |

Steps 1 and 4–7 were delivered together on
`codex/hcm-2-catalogue-organization-structure` as separate commits.

## Implementation decisions

Decisions answered after design approval are recorded here, not in the
[decision register](HCM-2-DECISIONS.md), whose reviewed content hash every HCM-2
app approval binds.

| ID           | Question                                                                                                                                                                             | Answer (product owner, 2026-09-26)                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DEC-HCM2-017 | The FDD names HR Operations as a reader of the organisation structure, but the reviewed seed granted Organization Structure discovery to Administration only. Should HR discover it? | Yes. `access.discovery@3` grants `hr-specialist` discovery, and the app joins the HR specialist catalogue under Workforce Operations. Discovery grants no business permission. |
| DEC-HCM2-018 | Identification Types and Lookup Values have the same gap: the FDDs name HR Operations as a reader, but discovery is Administration-only. Should HR discover them?                    | Yes. `access.discovery@4` grants `hr-specialist` discovery for both, and both join the HR specialist catalogue under Workforce Operations.                                     |

The open points found during step 5 are listed in the
[Organization Structure validation](../testing/HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#open-points).
