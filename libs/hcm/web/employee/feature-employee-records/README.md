# HCM Employee Records feature

Lazy feature for `/employee/employee-records` (app `EMPLOYEE_RECORDS`). HR reads tenant-wide worker
records, corrects person facts and collections with a reason, reveals emergency information for a
stated purpose, merges duplicates explicitly and creates workers.

- Floorplan `UX-FP-FCL` NATIVE with two columns:
  - Begin: `HcmDynamicPage` with name or worker-number search, employment status, record state,
    unit and sort filters over a server-mode Table (25, growing). Statuses are inverted
    ObjectStatus; names carry an Avatar.
  - Mid: `HcmObjectPage` for a record with Overview, Personal, Contact, Addresses, Family and
    emergency, Employment (employments, assignments and reporting lines, read-only) and History
    (UI5 Timeline of worker events). Person fields outside the HR allowlist are not shown; emergency
    contact numbers stay hidden until revealed.
- Person corrections, collection items (add, correct, end or deactivate), the emergency reveal and
  the merge use one focused native Dialog with a reason (a purpose for the reveal). Revealed values
  live only in that Dialog.
- New workers are created on `new` with `HcmWizardPage` (`UX-FP-WIZARD`): Person, Employment,
  Assignment and manager, Duplicate check and Review. Candidates block progress until the user
  confirms a different person with a reason; Review submits once with one retained idempotency key.
- References use server-filtered ComboBoxes, fixed lists Selects, dates DatePickers and numbers
  StepInputs. Data comes from the real Employee Records API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/employee-records/FDD.md) and
[TDD](../../../../../docs/hcm/apps/employee-records/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/employee-records.spec.ts`.
