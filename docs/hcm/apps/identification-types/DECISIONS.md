# Identification Types — decisions

## EVIDENCE

Wave-level business decisions live in the [HCM-2 decision register](../../roadmap/HCM-2-DECISIONS.md#decisions).
This register classifies them against this app's scope. RESOLVED entries without a
register reference are design selections made from current repository authority.

| ID                           | Classification          | Decision                                                                                                                               |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-IDENTIFICATION-TYPES-001 | RESOLVED                | Select UX-FP-DYNAMIC-PAGE NATIVE with a client-mode table; no detail page because the object has no content beyond its row.            |
| DEC-IDENTIFICATION-TYPES-002 | RESOLVED                | DEC-HCM2-016 resolved on 2026-09-26: tenants view the product-maintained catalogue only; there is no tenant management action.         |
| DEC-IDENTIFICATION-TYPES-003 | BLOCKS_LATER_CAPABILITY | Identification values, masking, reveal and duplicate hashing require a named statutory workflow and the accepted field-encryption ADR. |

## REVIEW

No reviewer approval is recorded yet. Approval of this design is recorded in
`APPROVALS.json` after human review of the exact content.
