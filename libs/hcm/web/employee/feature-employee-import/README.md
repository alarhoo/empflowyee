# HCM Employee Import feature

Lazy feature for `/employee/employee-import` (app `EMPLOYEE_IMPORT`). HR maintains versioned
import templates and imports workers from a CSV or XLSX file: every row is validated without
workforce side effects, every matched row is resolved by a person (DEC-HCM2-001), and commit
applies each valid row on its own.

- Floorplan `UX-FP-FCL` NATIVE with two columns:
  - Begin: `HcmDynamicPage` with a SegmentedButton scope (Runs, Templates) and a status Select
    over a server-mode Table (25, growing). Statuses are inverted ObjectStatus.
  - Mid: `HcmObjectPage` for a run (Overview with counts, Rows filtered by status and match
    status, File issues) or a template (Overview, Columns).
- New runs use the wizard route `runs/new` (`UX-FP-WIZARD`): Template and action, Upload
  (UI5 FileUploader, 5 MiB), Validate, Review matches and Commit. Each step unlocks only after
  the server confirms the previous one.
- Templates are created on `templates/new` and drafts edited on `templates/:templateId/edit`:
  format, date format, action and transformations use Select, the field mapping ComboBox,
  header row and match key CheckBox. Published versions are read-only; New version copies one.
- Validate, Commit, Cancel, Publish and New version use one focused Dialog; resolutions use the
  resolve Dialog, which offers only the resolutions that fit the row.
- The issue report downloads through authenticated HTTP and lists row numbers, fields and codes
  only. Data comes from the real Employee Import API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/employee-import/FDD.md) and
[TDD](../../../../../docs/hcm/apps/employee-import/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/employee-import.spec.ts`.
