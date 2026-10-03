# Leave prerequisite delivery evidence

Status: partial internal implementation, 2026-10-03. No Leave application or
requested milestone is complete. Work Schedules still needs real Leave impact
integration, source approval decisions and browser acceptance before My Schedule
and the Leave app journeys can be accepted.

## Implemented

- Official Nx-generated Leave universal contract, domain, application and
  infrastructure libraries; existing Runtime/Access/database patterns reused.
- Exact numeric(18,6) wire quantities and integer arithmetic; explicit rational
  rounding and row summation without floating-point conversion.
- Typed policy draft validation, including incomplete publication errors, Unpaid
  funding rejection, routing selectors, bounded Workflow graphs and no hidden
  accrual/proration/window defaults.
- Forward migration 59: Leave types, stable policies, effective versions and typed
  eligibility, assignment, accrual, carry-forward, comp-off, encashment, approval
  and blackout rules. Forced RLS, tenant-composite references, non-finite quantity
  rejection, parent locks and immutable published content.
- Transaction-bound policy repository with exact DTO reload, revision replacement
  and rollback. Runtime publication privileges remain withheld until actual impact
  review and lifecycle command integration are implemented.
- Authenticated policy list, exact-version read, draft create/update, successor
  version and type-option HTTP endpoints. Migration 60 adds immutable actor-bound
  command receipts with encrypted version reasons; migration 61 adds hash-only
  query continuation bound to current grant, query and source generation.
- Real Access transactions independently require operation permission and Leave
  entitlement, serialize revocation with effects, and reauthorize private receipt
  replay. API composition starts no durable loop and runs no migration.
- Migration 62 and the enrollment repository persist explicit periods, encrypted
  eligibility evidence and immutable dated enrollment identity. Balance accounts
  start empty and commit with activation; Unpaid cannot have an account. Period
  and policy state/range/revision checks, overlap exclusion and forced RLS defend
  admission. No enrollment HTTP endpoint or grant command is claimed yet.
- Pure eligibility evaluation preserves version/assignment/rule precedence,
  Exclude ties and whole-assignment matching. Missing facts and unknown statutory
  floors are unavailable; empty selectors do not grant universal eligibility.

## Verification

Executed on disposable PostgreSQL, without changing the persistent local database:

- Focused contract/domain plus Workflow reason-preservation regression: 3 suites,
  9 tests passed. Command: `pnpm exec vitest run --config
tools/milestones/hcm-3/vitest.config.mts libs/hcm/contracts/leave
libs/hcm/api/leave/domain libs/hcm/contracts/workflow/src/lib/actions.spec.ts`.
- Policy database and real HTTP suites: 12 tests passed, covering typed reload, exact quantities,
  stale revisions, rollback, RLS, tenant binding, composite unit/type ownership,
  incomplete publication denial, runtime publication privilege denial, published
  immutability, SQL numeric NaN/overflow, concurrent command replay, encrypted
  version reasons, permission/entitlement revocation, origin checks, server
  pagination, stale cursor binding and database-backed type options. Command:
  `pnpm exec vitest run --config tools/hcm-database/vitest.config.mts libs/hcm/api/leave`.
- Target Leave Policies readiness, architecture and documentation checks passed.
  Readiness is design admission, not UI acceptance.
- API composition build (`pnpm nx build hcm-api`), Leave module type check and
  affected implementation lint passed. The focused Leave contract/domain and
  audit regression run passed 10 tests in 3 suites after API integration.
- Enrollment follow-up: the same Leave database/HTTP command passed 17 tests in
  2 suites. Added checks cover zero-funded atomic account creation, encrypted
  row-bound evidence, Unpaid account rejection, policy/date/unit/revision guards,
  concurrent overlap, missing-account rollback and negative tenant access.
  Enrollment contract and eligibility tests passed 5 tests in 2 suites through
  `tools/milestones/hcm-3/vitest.config.mts`. Affected lint, Leave module/domain
  type checks and architecture checks passed. The API build above predates this
  internal follow-up; no new browser acceptance is claimed.

## Remaining

Further owner reference checks, policy impact review and publication,
authorized enrollment commands and ledger posting, accrual/expiry handlers,
source approvals and all requested Leave native UI/browser journeys remain to be
delivered. No balance has been manufactured by this foundation.

The half-day rounding conflict between Leave Business Rules 25 and the owning
technical design's independent per-row rounding has been raised for a product
decision. The exact quantity implementation does not choose either behavior.

Initial local Leave period dates have been raised for product configuration; no
calendar-year or financial-year default has been silently seeded.

Local PostgreSQL remains at migration 55 and Attendance seed 4; migrations 56–62
have been exercised only in disposable test databases. Back up the persistent
database and preserve its encryption key before explicit migration.
