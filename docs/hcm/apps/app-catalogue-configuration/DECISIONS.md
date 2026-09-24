# App Catalogue Configuration — decisions

## EVIDENCE

The product owner explicitly approved the local stage, access authority matrix and
bounded document/notification behavior. [Stage decision evidence](../../roadmap/HCM-1-DECISIONS.md)
records those approvals. These resolve business choices, not hashes of the new
app designs. No current business question blocks this bounded app.

| ID                                  | Classification          | Decision                                                                                                                                                     |
| ----------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DEC-APP-CATALOGUE-CONFIGURATION-001 | RESOLVED                | Apply the approved local actor, subject and action scope in this FDD; no production authentication or external integration.                                  |
| DEC-APP-CATALOGUE-CONFIGURATION-002 | RESOLVED                | Apply UX-FP-FCL NATIVE under the mandatory UX matrix: catalogue list and routed Object Page metadata details, no dialogs or writes.                          |
| DEC-APP-CATALOGUE-CONFIGURATION-003 | BLOCKS_LATER_CAPABILITY | Production authentication, external delivery, legal retention and unlisted business workflows remain outside this app; they require separate future designs. |

## REVIEW

The explicit local-stage implementation instruction and [UX direction](../../roadmap/HCM-1-UX-REVISION.md) authorize this technical reconciliation. The ledger records that authority, not a separate human review of generated code.
