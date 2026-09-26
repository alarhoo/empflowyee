# HCM-2 delivery progress

Status: **1 of 18 HCM-2 apps released.** Delivery follows the approved
[implementation order](HCM-2-DESIGN-REVIEW.md#order) under the
[implementation approval](HCM-2-IMPLEMENTATION-APPROVAL.md). An app becomes
`complete` in the canonical catalogue only after its implementation, tests and
validation record pass.

| Step | Delivers                                                                                                                | State       | Evidence                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| 1    | Catalogue admission of Organization Structure                                                                           | Delivered   | 171-app catalogue; `access.discovery@2`                             |
| 2    | Shared `HcmWizardPage`                                                                                                  | Not started | —                                                                   |
| 3    | `FieldCipher` port and local key                                                                                        | Not started | —                                                                   |
| 4    | Workforce structure foundation: migrations `000017`–`000018`, contracts, API, `workforce.foundation@2`, `access.hcm2@1` | Delivered   | `libs/hcm/api/workforce-foundation/**`; `pnpm hcm:db:test`          |
| 5    | Organization Structure app                                                                                              | Released    | [Validation](../testing/HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md) |
| 6–17 | Remaining foundations and apps                                                                                          | Not started | —                                                                   |

Steps 1, 4 and 5 were delivered together on
`codex/hcm-2-catalogue-organization-structure` as separate commits.

The open points found during step 5 are listed in the
[Organization Structure validation](../testing/HCM-2-ORGANIZATION-STRUCTURE-VALIDATION.md#open-points).
