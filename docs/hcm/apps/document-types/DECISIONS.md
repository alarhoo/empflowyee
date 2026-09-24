# Document Types — decisions

## EVIDENCE

The product owner explicitly approved the local stage, access authority matrix and
bounded document/notification behavior. [Stage decision evidence](../../roadmap/HCM-1-DECISIONS.md)
records those approvals. These resolve business choices, not hashes of the new
app designs. No current business question blocks this bounded app.

| ID                     | Classification          | Decision                                                                                                                                                     |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DEC-DOCUMENT-TYPES-001 | RESOLVED                | Apply the approved local actor, subject and action scope in this FDD; no production authentication or external integration.                                  |
| DEC-DOCUMENT-TYPES-002 | RESOLVED                | Select UX-FP-DYNAMIC-PAGE NATIVE, domain-owned projects and real API persistence as detailed in TDD. Technical selection is complete for revision review.    |
| DEC-DOCUMENT-TYPES-003 | BLOCKS_LATER_CAPABILITY | Production authentication, external delivery, legal retention and unlisted business workflows remain outside this app; they require separate future designs. |

## REVIEW

FDD/TDD/traceability/blueprint revisions and referenced domain/contract evidence
still require actual review under the factory approval process. Empty APPROVALS.json
is intentional; never fill it with invented reviewers, dates or consent to unseen content.
