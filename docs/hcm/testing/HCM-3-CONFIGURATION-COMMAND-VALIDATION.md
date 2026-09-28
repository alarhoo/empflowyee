# HCM-3 configuration command foundation validation

Verified locally on 2026-09-28 against disposable PostgreSQL 17 through migration
40. Nine database tests pass across `attendance-command-evidence.database.spec.ts`
and `schedule-commands.database.spec.ts`. The latter authenticates actual seeded
development sessions through the runtime, with explicit test operation grants.

Schedule/template Draft creation, exact-version replacement, immutable-source
successor creation and independent template copy now use one authorized transaction
with audit and an actor/operation/idempotency-key receipt. Concurrent retries return
one result; changed input and stale revisions fail. Current read authority is
required to return a prior response. Tenant-wide operation authority is required
for global roots; scoped-only, missing and revoked grants, disabled entitlement
and forged context are denied. Template retirement blocks subsequent copying.

Private copy/version reasons are encrypted with the existing tenant field cipher
and row-bound associated data. Wrong-row decryption fails. Encryption failure or
session expiry during an awaited effect rolls back root, children, receipt and
audit. Receipts are immutable. Negative SQL cases cover tenant visibility,
foreign actors and invalid human/workload attribution. The test publication
arrangement uses explicit fixture SQL; a publication application service is not
claimed by these results.

Migration 40 also stores typed, actor-bound configuration previews. Immutable
inputs and Ready results, expiry, conflict/locked-impact rejection, exact source
revision and single consumption are verified. Publication must consume a current
preview before advancing its source in the same transaction. No API or worker
preview orchestration is claimed yet.

The focused pure suite passes 33 tests, including two new audit cases that reject
unknown actions and private narrative in shared audit. The owning Attendance TDD's
STORAGE representation was reviewed under the existing delegated technical
finalization authority: typed version references, encrypted owner reasons,
source revision locking, fresh replay authority and atomic preview consumption
implement the approved lifecycle and privacy requirements. This is a technical
review, not a new human approval or acceptance of an implemented business app.

HTTP routes, list cursors, publication orchestration, production seed grants,
workday jobs and screens remain pending. All 23 app statuses remain Planned.

Architecture/documentation checks, targeted ESLint and infrastructure TypeScript
checking pass. The affected `hcm-api` build passes. Readiness passes for all 23
HCM-3 apps and all 61 admitted apps; later-capability warnings remain intentional.
