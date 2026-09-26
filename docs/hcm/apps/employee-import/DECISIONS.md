# Employee Import — decisions

## EVIDENCE

Wave-level business decisions live in the [HCM-2 decision register](../../roadmap/HCM-2-DECISIONS.md#decisions).
This register classifies them against this app's scope. RESOLVED entries without a
register reference are design selections made from current repository authority.

| ID                      | Classification          | Decision                                                                                                                                                        |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-EMPLOYEE-IMPORT-001 | RESOLVED                | Select UX-FP-FCL NATIVE for runs and templates, a UX-FP-WIZARD route for new runs and a dedicated template editor.                                              |
| DEC-EMPLOYEE-IMPORT-002 | RESOLVED                | DEC-HCM2-001 resolved on 2026-09-26: name plus birth date or work email candidates need an HR resolution per row before commit.                                 |
| DEC-EMPLOYEE-IMPORT-003 | RESOLVED                | Runs are synchronous and bounded to 5 MiB and 2,000 data rows, a technical limit of the current runtime topology. Larger imports need a background runtime ADR. |
| DEC-EMPLOYEE-IMPORT-004 | BLOCKS_LATER_CAPABILITY | Invitation batches need production authentication and external delivery, which are deferred.                                                                    |

## REVIEW

No reviewer approval is recorded yet. Approval of this design is recorded in
`APPROVALS.json` after human review of the exact content.
