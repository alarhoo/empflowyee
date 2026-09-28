# HCM-3 monthly period fence technical review

Reviewed 2026-09-28 by Codex under the existing
[delegated technical authority](../roadmap/HCM-3-DESIGN-APPROVAL.md#authority).
The [physical period fence design](../architecture/TDD-HCM-3-DATA-MODEL.md#period-fences)
refines the approved monthly periods, immutable locks and publication fencing into
SQL identities, lifecycle constraints, lock ordering and an explicit absent-period
snapshot. It reuses the current tenant authority and PostgreSQL advisory mechanics.

This introduces no new business decision, tenant isolation model, source authority
or deployable. The approved independent reopen decision remains mandatory; until
its owning source-case adapter exists, storage rejects reopening. This is a staged
implementation boundary, not removal of the approved capability. No source decision,
reconciliation success or worker completion is manufactured by this design review.

The owning Attendance TDD already requires period fences and revision-bound
publication. All affected app approvals bind the reviewed physical supplement.
Readiness must pass before this slice is implemented; it does not establish runtime
acceptance or separate human review of these authored bytes.
