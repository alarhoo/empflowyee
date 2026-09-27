# HCM Probation Management feature

Lazy feature for `/employee/probation-management` (app `PROBATION_MANAGEMENT`). HR tracks employees
in probation, schedules reviews, assigns an explicit reviewer and records the decision under
DEC-HCM2-003: a Final review due 14 days before the end date, one extension of at most 90 days,
and an Escalated state 7 days after the due date.

- Floorplan `UX-FP-FCL` NATIVE with two columns:
  - Begin: `HcmDynamicPage` with a SegmentedButton view (Due soon, Overdue, All) and worker
    search over a server-mode Table of cases (25, growing). Probation status and the next review's
    state are inverted ObjectStatus; Overdue and Escalated are Negative. A case without an open
    review opens the Schedule dialog instead.
  - Mid: `HcmObjectPage` for a review with Overview, Reviews, Assessments, Decision and History
    (UI5 Timeline).
- Schedule, reviewer assignment, cancellation and the decision use one focused Dialog with Signal
  Forms: Select for review type and outcome, DatePicker for dates, a server-filtered ComboBox for
  the employee and the reviewer, TextArea for the reason. The extended end date appears only for
  Extend and is bounded by the server's limit; Extend is not offered after an extension.
- Data comes from the real Probation Management API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/probation-management/FDD.md) and
[TDD](../../../../../docs/hcm/apps/probation-management/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/probation-management.spec.ts`.
