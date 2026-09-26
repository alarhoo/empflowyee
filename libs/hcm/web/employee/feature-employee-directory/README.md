# HCM Employee Directory feature

Lazy feature for `/employee/employee-directory` (app `EMPLOYEE_DIRECTORY`). Every worker finds
colleagues in the current workforce and sees organisation-visible contact and placement
information only.

- Floorplan `UX-FP-FCL` NATIVE: the begin column is a server-mode table (25 per page, growing)
  with a name, work email or worker number search, server-filtered ComboBoxes for unit,
  department, location and designation, and native view settings for name sorting; the mid
  column is an Object Page per worker (`/employee/employee-directory/:workerId`) with Overview,
  Reporting and Additional information.
- Fields follow the employee field policy; omitted fields stay omitted. Data comes from the real
  employee API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/employee-directory/FDD.md) and
[TDD](../../../../../docs/hcm/apps/employee-directory/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/employee-directory.spec.ts`.
