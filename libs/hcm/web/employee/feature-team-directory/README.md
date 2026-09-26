# HCM Team Directory feature

Lazy feature for `/employee/team-directory` (app `TEAM_DIRECTORY`). Managers holding the team
permission see their direct reports (DEC-HCM2-015) with the placement, employment and probation
facts a manager may see; no personal or sensitive data.

- Floorplan `UX-FP-FCL` NATIVE: the begin column is a server-mode table (25, growing) with a name
  search, a location ComboBox and a probation Select; the mid column is an Object Page per member
  (`/employee/team-directory/:workerId`) with Overview, Employment and Probation.
- The server resolves the team from the verified actor on every request. Data comes from the real
  employee API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/team-directory/FDD.md) and
[TDD](../../../../../docs/hcm/apps/team-directory/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/team-directory.spec.ts`.
