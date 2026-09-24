# Role Management — decisions

## UX revision

On 2026-09-24 the product owner explicitly instructed: "Keep the filter/list in the begin column and open the selected role in a mid-column Object Page with Overview, Permissions, Assignees, and History/Audit sections." They also required dedicated routes for complex creation and Access Assignments ownership of assignment behavior. This supersedes the earlier dialog selection while preserving role commands and the authority matrix. The contextual reads require existing assignment/audit permissions and domain-owned services. Validation remains mandatory; this instruction is design authorization, not evidence of passing checks.

## EVIDENCE

The product owner explicitly approved the local stage, access authority matrix and
bounded document/notification behavior. [Stage decision evidence](../../roadmap/HCM-1-DECISIONS.md)
records those approvals. These resolve business choices, not hashes of the new
app designs. No current business question blocks this bounded app.

| ID                      | Classification          | Decision                                                                                                                                                                    |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-ROLE-MANAGEMENT-001 | RESOLVED                | Apply the approved local actor, subject and action scope in this FDD; no production authentication or external integration.                                                 |
| DEC-ROLE-MANAGEMENT-002 | RESOLVED                | Select UX-FP-FCL NATIVE with an Object Page detail, domain-owned projects and real API persistence as detailed in TDD. Technical selection is complete for revision review. |
| DEC-ROLE-MANAGEMENT-003 | BLOCKS_LATER_CAPABILITY | Production authentication, external delivery, legal retention and unlisted business workflows remain outside this app; they require separate future designs.                |

## REVIEW

The current approval ledger binds the explicit product-owner UX directive and existing local-stage approval to the reviewed design inputs. Implementation checks remain separate evidence; no new production capability is authorized.
