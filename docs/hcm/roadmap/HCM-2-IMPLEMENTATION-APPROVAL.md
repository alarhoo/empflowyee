# HCM-2 implementation approval

On 2026-09-26 the product owner received the completed HCM-2 design review
(design revision `b2938b9`), with every blocking business decision answered, and
instructed implementation:

> implement as per @claude-prompts/03-HCM2-STEP2-IMPLEMENT.md

The referenced instruction states its prerequisite as "HCM-2 Step 1
FDD/TDD/readiness is approved with zero blocking decisions" and directs
implementation "in the approved order". This instruction is recorded as the
product owner's approval of the reviewed design bytes, following the
[HCM-1 precedent](HCM-1-IMPLEMENTATION-APPROVAL.md). The app approval ledgers
bind it to the exact document hashes at revision `b2938b9`.

Source: user message in the HCM-2 preparation and implementation task.

## Scope of this approval

- It admits implementation of the 18 apps in the
  [design review](HCM-2-DESIGN-REVIEW.md#order) in the approved order.
- It publishes the reviewed routes and floorplans in the canonical catalogue for
  the 17 existing apps. Organization Structure is admitted through its catalogue
  slice.
- Apps remain Planned until their individual implementation, tests and review
  gates pass.
- The [field-encryption ADR](../adr/ADR-HCM-FIELD-ENCRYPTION.md) was item 5 of the
  approved review. It is accepted for local implementation with a local key. The
  production Cloud KMS dependency and its IaC change still need their own review
  before any non-local deployment stores encrypted values.
- It does not certify code, tests, operational readiness or completion of any app.

The readiness results recorded in the design review predate this approval. Current
results come from `pnpm hcm:app:readiness`.
