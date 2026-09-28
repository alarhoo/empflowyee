# HCM-3 immutable workday storage technical review

Reviewed 2026-09-28 by Codex under the existing
[delegated authority](../roadmap/HCM-3-DESIGN-APPROVAL.md#authority).
The [physical evidence design](../architecture/TDD-HCM-3-DATA-MODEL.md#workday-evidence)
implements the approved exact-time, cross-midnight, immutable input history and
period-fence requirements. Multiple typed holiday version references preserve the
following civil date without weakening tenant-composite integrity. ExpectedWork
is the existing exact subtraction result, not a new rounding or overtime policy.

This staged storage slice covers assigned schedules; roster/override adapters and
typed references remain in their owning later implementation slices. It introduces
no new business decision, authority, tenant ownership or deployable. Workload leases
and source input revalidation remain required in the worker, and SQL persistence
alone does not establish app acceptance or a completed worker capability.

The affected approvals bind the physical supplement under existing delegated
technical review. No separate human approval of these authored bytes is claimed.
