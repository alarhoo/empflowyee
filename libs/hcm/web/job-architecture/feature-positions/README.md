# HCM Positions feature

Lazy feature for `/job-architecture/positions` (app `POSITIONS`). HR requests new positions and
position changes; an independent approver decides them. Both read positions and requests.

- Floorplan `UX-FP-FCL` NATIVE with three columns:
  - Begin: `HcmDynamicPage` with a SegmentedButton for Positions (server mode, 25, growing,
    code or name search, status and vacancy Selects) and Change requests (all, mine or awaiting
    my decision, and status).
  - Mid: `HcmObjectPage` for a position with Overview, Capacity and incumbents, Relationships,
    Versions (UI5 Timeline) and Change requests. Unavailable occupancy is shown as such, never
    as zero.
  - End: `HcmObjectPage` for a change request with Request details, Proposed changes, Impact
    preview and Decision. Preview and Submit run from its actions.
- New positions, changes and draft requests are edited on `new`, `:positionId/change` and
  `requests/:requestId/edit` with dirty-leave protection. References use server-filtered
  ComboBoxes, capacities StepInputs and the effective date a DatePicker.
- Freeze, Reopen, Close, Cancel, Withdraw and Approve or Reject use a focused native Dialog.
- Data comes from the real job architecture API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/positions/FDD.md) and
[TDD](../../../../../docs/hcm/apps/positions/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/positions.spec.ts`.
