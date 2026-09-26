# Probation Management — decisions

## EVIDENCE

Wave-level business decisions live in the [HCM-2 decision register](../../roadmap/HCM-2-DECISIONS.md#decisions).
This register classifies them against this app's scope. RESOLVED entries without a
register reference are design selections made from current repository authority.

| ID                           | Classification          | Decision                                                                                                                                        |
| ---------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-PROBATION-MANAGEMENT-001 | RESOLVED                | Select UX-FP-FCL NATIVE with Object Page detail and focused dialogs.                                                                            |
| DEC-PROBATION-MANAGEMENT-002 | RESOLVED                | DEC-HCM2-003 resolved on 2026-09-26: final review due 14 days before end; 1–5 rating; one extension up to 90 days; escalation 7 days after due. |
| DEC-PROBATION-MANAGEMENT-003 | RESOLVED                | Reviewer authority is the explicit reviewer stored on the review, consistent with the rule that reporting lines never authorize.                |
| DEC-PROBATION-MANAGEMENT-004 | BLOCKS_LATER_CAPABILITY | Pushing escalation notifications at the escalation time needs a background runtime ADR; HCM-2 shows the Escalated state on read.                |

## REVIEW

No reviewer approval is recorded yet. Approval of this design is recorded in
`APPROVALS.json` after human review of the exact content.
