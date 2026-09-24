# Identity Administration — decisions

## EVIDENCE

The product owner explicitly approved the local stage, access authority matrix and
bounded document/notification behavior. [Stage decision evidence](../../roadmap/HCM-1-DECISIONS.md)
records those approvals. These resolve business choices, not hashes of the new
app designs. No current business question blocks this bounded app.

| ID                              | Classification          | Decision                                                                                                                                                     |
| ------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DEC-IDENTITY-ADMINISTRATION-001 | RESOLVED                | Apply the approved local actor, subject and action scope in this FDD; no production authentication or external integration.                                  |
| DEC-IDENTITY-ADMINISTRATION-002 | RESOLVED                | Apply the mandatory UX matrix: UX-FP-FCL NATIVE, begin-column filters, mid-column Object Page and focused three-field create/enable dialogs.                 |
| DEC-IDENTITY-ADMINISTRATION-003 | BLOCKS_LATER_CAPABILITY | Production authentication, external delivery, legal retention and unlisted business workflows remain outside this app; they require separate future designs. |

## REVIEW

The product owner explicitly directed implementation of the approved local stage and the mandatory UX matrix. [Instruction evidence](../../roadmap/HCM-1-UX-REVISION.md) records the authority for this technical reconciliation. The ledger binds this revision to that instruction; it does not assert a separate human review of generated code.
