# HCM Job Catalogue feature

Lazy feature for `/job-architecture/job-catalogue` (app `JOB_CATALOGUE`). Tenant administrators
maintain and publish the versioned job catalogue and job profiles; HR reads them.

- Floorplan `UX-FP-FCL` NATIVE: the begin column switches between the catalogue versions and a
  server-mode job profile table (25, growing) with a native SegmentedButton. The mid column is an
  Object Page for a catalogue version (Overview, Job families as a Tree, Career tracks and levels,
  Bands and grades) or a profile version (Overview, Responsibilities, Requirements, Allowed grades,
  Versions as a Timeline).
- Element edits, submission, publication and new drafts use focused native Dialogs. New profiles
  and profile drafts are edited on `/job-architecture/job-catalogue/profiles/:id/edit` with
  dirty-leave protection.
- Data comes from the real job architecture API; no fixtures or feature CSS.

See the [FDD](../../../../../docs/hcm/apps/job-catalogue/FDD.md) and
[TDD](../../../../../docs/hcm/apps/job-catalogue/TDD.md). Browser acceptance is in
`apps/hcm/web-e2e/live/job-catalogue.spec.ts`.
