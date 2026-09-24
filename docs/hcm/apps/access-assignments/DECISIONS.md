# Access Assignments — decisions

## EVIDENCE

The product owner explicitly approved the local stage, access authority matrix and
bounded document/notification behavior. [Stage decision evidence](../../roadmap/HCM-1-DECISIONS.md)
records those approvals. These resolve business choices, not hashes of the new
app designs. No current business question blocks this bounded app.

| ID                         | Classification          | Decision                                                                                                                                                           |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DEC-ACCESS-ASSIGNMENTS-001 | RESOLVED                | Apply the approved local actor, subject and action scope in this FDD; no production authentication or external integration.                                        |
| DEC-ACCESS-ASSIGNMENTS-002 | RESOLVED                | Select UX-FP-FCL NATIVE with a mid-column shared Object Page, domain-owned projects and real API persistence as detailed in TDD. Use focused grant/revoke dialogs. |
| DEC-ACCESS-ASSIGNMENTS-003 | BLOCKS_LATER_CAPABILITY | Production authentication, external delivery, legal retention and unlisted business workflows remain outside this app; they require separate future designs.       |

## REVIEW

The local-stage implementation instruction and subsequent explicit UX direction authorize this bounded slice. The ledger records those instructions; it does not claim a human reviewed generated code or execution artifacts.

## UX revision

The explicit [owner directive](../../roadmap/HCM-1-UX-REVISION.md) supersedes the earlier single Dynamic Page selection: native FCL and a shared mid-column Object Page now own meaningful account details. Focused grant/revoke dialogs retain their approved business behavior. The single-account GET is an additive read projection for deep links, not a new business action.
