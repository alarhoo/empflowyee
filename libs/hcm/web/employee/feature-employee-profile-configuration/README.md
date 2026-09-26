# HCM Employee Profile Configuration feature

Lazy feature for `/employee/employee-profile-configuration` (app
`EMPLOYEE_PROFILE_CONFIGURATION`). HR narrows the product profile field policy for the tenant
and defines custom fields; tenant administrators read it. Product ceilings are never widened.

- Floorplan `UX-FP-FCL` NATIVE: the begin column is a client-mode field table with a Standard or
  Custom scope and section and sensitivity filters; the mid column is an Object Page with
  Overview, Tenant policy, Options and Effective visibility sections.
- Tenant policy, custom field edits, retirement and options use native Dialogs; a new custom field
  uses the dedicated route `custom-fields/new`.
- Data comes from the real employee API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/employee-profile-configuration/FDD.md) and
[TDD](../../../../../docs/hcm/apps/employee-profile-configuration/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/employee-profile-configuration.spec.ts`.
