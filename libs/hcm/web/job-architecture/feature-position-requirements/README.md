# HCM Position Requirements feature

Lazy feature for `/job-architecture/position-requirements` (app `POSITION_REQUIREMENTS`). HR
proposes requirement variances for a position; they travel through the Positions change request
approval. Administrators read requirements and decide requests in Positions.

- Floorplan `UX-FP-FCL` NATIVE:
  - Begin: `HcmDynamicPage` with the position table (server mode, 25, growing, code or name
    search, and a variance Select).
  - Mid: `HcmObjectPage` with Effective requirements, Proposed variances, Profile requirements
    and Variance history. Source and variance use inverted ObjectStatus; Waived is Critical.
- Add, Replace, Strengthen and Waive use one focused native Dialog: requirement type and unit
  are Selects, the minimum quantity a StepInput, mandatory a CheckBox and the justification a
  TextArea (required for Waive, up to 2,000 characters). The first variance also records the
  reason and starts the draft request.
- Submission opens a confirmation Dialog that calculates and shows the impact preview before
  submitting against it. Decisions and withdrawals happen in Positions, which shows the same
  request.
- Data comes from the real job architecture API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/position-requirements/FDD.md) and
[TDD](../../../../../docs/hcm/apps/position-requirements/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/position-requirements.spec.ts`.
