# HCM-3 AttendanceResolve worker validation

Executed locally on 2026-09-28 with disposable PostgreSQL, forward migrations
through 46, canonical seed tooling and the restricted runtime role. No developer
or deployed database was migrated/reset; no cloud activation is claimed.

Seven handler/runtime SQL tests and four existing immutable-workday SQL regression
tests passed (11 total). They prove concurrent identical intents produce one exact
DST workday; stale/missing inputs and Closing periods produce Unavailable receipts;
workday/receipt/completion audit roll back after injected failure or lease expiry;
original intent retry succeeds; direct handler publication without atomic outbox
completion is rejected; copied/wrong-workload authority and unknown payload fields
are denied; completion reloads stored intent; runtime cannot delete receipts;
real foreign tenants cannot read receipts or attach another tenant's workday.

The finite shared runtime drained a real resolution intent with the registered
handler and rejected a selected unimplemented Leave lane. Available and Unavailable
are distinct domain receipt states; Runtime Completed is durable job completion,
not an assertion that every workday was published. Migration 46 preserves immutable
receipt evidence under FORCE RLS and same-tenant outbox/workday foreign keys.

TypeScript checks cover the worker and the new pure/SQL test sources. Affected
ESLint has no errors or warnings. HCM-3 foundation validation passed (23 required
files/apps); admitted readiness passed (61 ready, zero blocked). The worker build passed after preserving the caller's explicit Kysely database
type. Architecture, documentation and the API build also passed for
the shared infrastructure export.

No additional business app is Complete. Source assignment/publication producers,
remaining workers, roster/override integration, recovery UI and operational source
metrics remain delivery work in the approved order. The authored
[technical review](HCM-3-RESOLVE-WORKER-REVIEW.md) uses existing delegation and does
not claim a separate human review of authored implementation bytes.
