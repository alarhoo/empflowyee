# HCM-3 holiday query technical review

Codex technical review on 2026-09-28 under the existing product-owner
[delegation](../roadmap/HCM-3-DESIGN-APPROVAL.md#authority). This is implementation
refinement of the approved calendar list/curation routes, not a new business
policy or separate human approval.

The owning TDD now explicitly applies the previously approved opaque Attendance
cursor contract to Holiday Calendars: latest version before filters, bounded
literal filters, deterministic code/name/state/id sorting, no unknown/duplicate
query keys, fresh current read grants and actor/query/source-bound continuation.
Exact-version path routes reject query selectors. DTOs remain calendar-owned.

A forward migration extends the existing Attendance cursor's closed app allowlist
and replaces its schedule-only root FK with generated typed schedule/calendar
references derived from app code and last ID. Both have tenant-composite FKs.
The public handle, existing insert shape, expiry, RLS, no-UPDATE grant and bounded
expired cleanup remain compatible. No ownership, tenant-isolation, authentication
or public-contract-breaking change is introduced. The migration must verify old
schedule rows as well as foreign/mismatched calendar references.

Approval hashes bind the owning app TDD, Attendance TDD and shared SQL supplement.
Readiness must pass before implementing this refinement. The app remains Planned;
query delivery alone cannot approve publication, assignment, workers or native UI.
