# HCM Probation Review feature

Lazy feature for `/employee/probation-review` (app `PROBATION_REVIEW`). An assigned reviewer sees
only the probation reviews whose stored reviewer is their account, reads minimal context and
submits an assessment for HR. A new submission supersedes the current one until HR decides; after
the decision assessments are read-only.

- Floorplan `UX-FP-FCL` NATIVE with two columns:
  - Begin: `HcmDynamicPage` titled Probation Review with a status Select over a server-mode Table
    of assigned reviews (25, growing); state is an inverted ObjectStatus.
  - Mid: `HcmObjectPage` with Employee (name, designation, unit, hire date and probation period
    only), Assessment and History sections.
- The assessment runs on the dedicated route `:reviewId/assessment` with Signal Forms and
  dirty-leave protection: a Select for the recommendation, a UI5 RatingIndicator from 1 to 5, and
  TextAreas for strengths, concerns and the reason.
- Data comes from the real Probation Review API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/probation-review/FDD.md) and
[TDD](../../../../../docs/hcm/apps/probation-review/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/probation-review.spec.ts`.
