# HCM Employment Changes feature

Lazy feature for `/employee/employment-changes` (app `EMPLOYMENT_CHANGES`). HR requests typed,
effective-dated changes to employment and assignment facts; an independent approver decides them
under `employment-change@1` (DEC-HCM2-002). Both read requests.

- Floorplan `UX-FP-FCL` NATIVE with two columns:
  - Begin: `HcmDynamicPage` with a SegmentedButton view (All, Mine, Awaiting my decision), worker
    search, change type and status Selects, an effective date range and sort over a server-mode
    Table (25, growing). Request status is an inverted ObjectStatus.
  - Mid: `HcmObjectPage` for a request with Overview, Proposed changes (current against proposed
    as Label and Text cells), Approvals, Execution and History (UI5 Timeline).
- New requests and draft edits run on `new` and `:requestId/edit` with `HcmWizardPage`
  (`UX-FP-WIZARD`): Worker and context, Change type, Details and Review and submit. Details renders
  only the target facts of the chosen type, prefilled with current facts, and proposes only what
  changed; clearing an optional fact proposes none. The effective date DatePicker is bounded by
  the backdating limit. Review creates or updates the draft and submits it, each with one retained
  idempotency key.
- Submit, Approve, Reject, Apply (Retry after a failure) and Cancel use one focused Dialog.
- References use server-filtered ComboBoxes effective on the effective date, fixed lists Selects,
  numbers StepInputs. Data comes from the real Employment Changes API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/employment-changes/FDD.md) and
[TDD](../../../../../docs/hcm/apps/employment-changes/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/employment-changes.spec.ts`.
