# Document Requests — decisions

## EVIDENCE

The product owner explicitly approved the local stage, access authority matrix and
bounded document/notification behavior. [Stage decision evidence](../../roadmap/HCM-1-DECISIONS.md)
records those approvals. These resolve business choices, not hashes of the new
app designs. No current business question blocks this bounded app.

| ID                        | Classification          | Decision                                                                                                                                                                           |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-DOCUMENT-REQUESTS-001 | RESOLVED                | Apply the approved local actor, subject and action scope in this FDD; no production authentication or external integration.                                                        |
| DEC-DOCUMENT-REQUESTS-002 | RESOLVED                | Select UX-FP-FCL NATIVE with begin scope/list and mid Object Page; route complex creation separately and use focused transition/submission dialogs under the authorized UX matrix. |
| DEC-DOCUMENT-REQUESTS-003 | BLOCKS_LATER_CAPABILITY | Production authentication, external delivery, legal retention and unlisted business workflows remain outside this app; they require separate future designs.                       |
| DEC-DOCUMENT-REQUESTS-004 | RESOLVED                | Notification deep links select the recipient's scope: requested/replacement notices open Own scope; submitted notices open HR scope. Destinations keep their existing checks.      |

## REVIEW

The [implementation instruction](../../roadmap/HCM-1-IMPLEMENTATION-APPROVAL.md)
admits the business design. The [explicit UX correction](../../roadmap/HCM-1-UX-REVISION.md)
authorizes this selection reconciliation. Executed validation remains separate evidence.

On 2026-09-26 the product owner resolved DEC-DOCUMENT-REQUESTS-004 by selecting
"Per event (Recommended)" when asked which scope notification deep links should
open. The approved TDD had required Own scope for every link, which the HR
recipient of a submitted notice cannot read; the
[validation record](../../testing/HCM-1-DOCUMENT-REQUESTS-VALIDATION.md) documents
that release hold and its resolution.
