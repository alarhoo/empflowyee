# HCM Org Chart feature

Lazy feature for `/workforce-foundation/org-chart` (app `ORG_CHART`). Every worker explores the
current reporting structure using only organisation-visible information; the chart grants no
access and offers no actions.

- Floorplan `UX-FP-FCL` NATIVE: the begin column is a lazily expanded UI5 Tree of current primary
  solid lines with a name or worker number search that reveals a person's path; the mid column is
  an Object Page per assignment (`/workforce-foundation/org-chart/:assignmentId`) with Overview
  and Direct reports.
- Fields follow the employee field policy through `OrgChartFieldPolicy`; omitted fields stay
  omitted. Data comes from the real workforce API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/org-chart/FDD.md) and
[TDD](../../../../../docs/hcm/apps/org-chart/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/org-chart.spec.ts`.
