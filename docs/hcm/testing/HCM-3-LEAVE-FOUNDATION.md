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
- Migration 63 and the internal grant ledger port append immutable source grants
  and matching exact postings, serialize account sequence/balance updates and
  preserve same-key results. Source commands still own permission, evidence,
  independent approval where required, audit and command receipts. No public
  grant endpoint, opening seed balance or completed accrual handler is implied.
- Exact accrual quantity core supports explicit None/CalendarDays/WorkingDays
  proration, waiting periods, posted-balance caps and unavailable working facts.
  Occurrence planning and worker integration remain unimplemented.
- Workforce exposes a minimal private eligibility owner port; Attendance exposes
  stored workday intervals with current-source digest validation. The existing
  Attendance UI query reuses the same stored projection. No new public endpoint
  or private schedule/calendar field was added.

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
- Grant-ledger follow-up: the Leave PostgreSQL/HTTP run passed 20 tests in 2
  suites, including simultaneous same-key and different-key postings, exact
  millionth-unit totals, immutable evidence, direct-balance-edit denial, full
  rollback after source failure, unmatched grant/posting rejection and RLS.
  Affected lint and Leave module type check passed.
- Source-port follow-up: Attendance resolver/worker suite passed 8 PostgreSQL
  tests; Workforce time/eligibility suite passed 10. Checks prove absent workdays
  are not materialized by reads, changed source facts invalidate stored evidence,
  person revision changes invalidate eligibility and cross-tenant binding fails.
  Leave domain suite passed 10 pure tests, including 3 accrual tests. Affected
  lint, Attendance/Workforce module type checks and a fresh API build passed.
  The first formatting attempt encountered a transient Windows file lock; the
  full formatter/lint rerun succeeded. These checks are not browser acceptance.

## Remaining

Further owner reference checks, policy impact review and publication,
authorized entitlement posting, accrual/expiry handlers,
source approvals and all requested Leave native UI/browser journeys remain to be
delivered. No balance has been manufactured by this foundation.

The half-day rounding conflict between Leave Business Rules 25 and the owning
technical design's independent per-row rounding has been raised for a product
decision. The exact quantity implementation does not choose either behavior.

Initial local Leave period dates have been raised for product configuration; no
calendar-year or financial-year default has been silently seeded.

At the initial enrollment-command review, local PostgreSQL remained at migration
55 and Attendance seed 4; migrations 56–64 had only been exercised in disposable
databases. The later explicit local preparation is recorded below.

## Enrollment command integration

On 2026-10-03 Codex reviewed the actual enrollment command design under the
existing delegated technical authority. The command uses the existing Access
transaction, Workforce owner ports, eligibility engine, immutable policy/period
references and enrollment/account repository. Review covered whole-grant scope
across all dates, private eligibility after authorization, period/policy locking,
bounded omitted-end semantics, encrypted receipts and the Unpaid exclusion. No
new business defaults, architecture boundary or independent human approval is
claimed. The app remains Planned.

The Leave PostgreSQL/API run passed 23 tests in two suites. New HTTP cases cover
missing/Planned/Closing periods, explicit eligibility across every date, a later
Exclude rollback, concurrent replay, changed-key payload rejection, encrypted
reason, reload, revoked read permission, selected-employment scope and Unpaid
without accounts. Balance enrollment starts at exactly zero with no ledger rows.
Published policies and period dates in these tests are explicit disposable
prerequisite fixtures, not evidence of policy publication or seeded local UI.
The audit regression passed two tests; affected lint and the Leave module type
check passed. No native UI/browser acceptance is established by these tests.

## Canonical access and current local runtime

Versioned `access.leave@1` seeds only the implemented policy read/draft and
administration read/manage permissions. David's existing Tenant Administrator
grant receives those four operations; Toby's HR Operations role receives the
two enrollment operations. Employment scope is still checked by the API. No
publication/decision grant, policy entitlement, period date or balance is invented.
Reset refuses retained Leave command/enrollment evidence or other roles using
the new permissions. The app catalogue remains Planned.

The canonical seed and Leave PostgreSQL/HTTP run passed 36 tests in three suites.
Test-only operation grants were removed: the API tests now use the versioned
permissions, including Toby enrollment success and policy drafting denial. The
first seed regression failed because its CLI test expected an obsolete hardcoded
module count of 30; it now compares apply/reset counts with the reviewed manifest
(34 versions), and the full run passed. No failed run is counted as acceptance.

On 2026-10-03 explicit local preparation applied nine forward migrations, through
64, and Leave access seed 1 after a verified 1,352,835-byte custom-format backup.
The backup inventory included the tenant table and the original field-encryption
key hash was unchanged. Only task-owned API/worker processes were restarted.
The current API and shared worker builds passed; the worker still admits only
AttendanceResolve and WorkflowPlan. API liveness/readiness and the tenant-host
web entry point returned 200. These health checks do not establish UI acceptance.

Current broader admission is 59 of 61 ready. My Profile and Org Chart still have
stale FDD/TDD/traceability approval hashes; no unrelated approvals were refreshed.
The seed-projection check (`pnpm hcm:db:seed:check`) failed at the unchanged
`access.discovery.1.apply.sql` projection. Neither that immutable applied seed,
its generator nor its catalogue inputs changed in this slice; forward Leave seed
apply/reset tests passed. The projection check is not reported as passing and
the historical seed was not rewritten.

## Current workday calculation

On 2026-10-03 the Full and resolved Hourly calculation prerequisite passed 24
Leave domain/application tests across five suites. Eight real PostgreSQL worker
tests also passed, now including Leave consumption of an actual 28,800,250 ms
published overnight workday as exactly one day and refusal after its Workforce
source revision changes. Pure cases cover lunch/partial holidays, DST repeated
hours, fractional milliseconds, per-row rounding, hourly increments, nonworking
versus unavailable days, changed source fingerprints, explicit period/version
bounds and Unpaid units without an account. No production fixture or SQL balance
edit was introduced. The worker/database test proves persisted source compatibility,
not Leave submission or a browser journey.

Codex reviewed the private owner-port calculation against the owning Leave
algorithm and Attendance projection under existing delegated technical authority.
The caller retains current authorization and transaction/lock duties; the calculator
does not admit eligibility, evidence, overlap, notice or funding. Half-day rounding
and initial local period configuration remain unanswered. Apply Leave remains
Planned; its full API, reservations, approvals and native UI still require delivery.
Affected ESLint, Leave/Attendance module TypeScript, hcm-api build, architecture,
documentation/catalogue and Apply Leave readiness passed. No SQL migration or
seed changed in this calculation slice, and the local running UI is unchanged.

## Calculated request drafts

The self-service POST/GET `/api/v1/leave/me/requests` now create and reload a
calculated Draft. Full and explicit Hourly rows use current Attendance workdays,
explicit enrollment/policy/period bounds and current dated eligibility. Hourly
wall endpoints retain day offsets and per-endpoint DST evidence. Gaps, missing
repeated-hour choices and mismatches reject. Reasons and private basis evidence
are encrypted. Safe reads omit narrative and eligibility facts.

Migration 65 adds tenant-owned request/day/interval evidence with forced RLS,
tenant-composite source references, immutable evidence and deferred completeness.
It also extends existing source receipts. `access.leave@2` grants only implemented
self read/draft operations; server ownership checks still apply to administrators
and HR. No account funding, reservation, Workflow intake or approval is created.
Nonempty document references reject until governed evidence admission is wired.
Half-day rounding remains pending; no disputed behavior is silently selected.

On 2026-10-03 the Leave/seed PostgreSQL run passed 42 tests in four suites,
including six request API cases. It exercises concurrent duplicate Draft creation,
safe reload, encrypted reason, current read revocation, self/foreign tenant denial,
exact Hourly rows, invalid/missing sources, immutable/deferred storage and Unpaid
units without an account. Published policy and period prerequisites are explicit
disposable fixtures; they do not prove publication UI acceptance. The focused
Leave contract/domain/application run passed 39 tests in nine suites, including
DST, fractional local times and nested validation field paths. Affected ESLint and
Leave module TypeScript passed. Persistent local PostgreSQL remains at migration
64 and Leave access seed 1; this migration/seed has only run in disposable tests.
The hcm-api build, architecture, documentation/catalogue and Apply Leave readiness
checks also passed. No native UI changed and no new browser acceptance is claimed.
An additional broad Audit run passed 16 of 19 tests. Three existing app cases
(`audit-log`, `my-activity`, `data-export-log`) failed when their prerequisite role
creation returned 503 instead of 201. The focused Attendance audit sanitizer cases
passed. The broader Audit run is not counted as passing; its role-command harness
needs separate diagnosis before broad regression acceptance.

Codex reviewed the concrete request fields and storage design under existing
delegated technical authority, including owner ports, exact self scope, current
source checks, row-bound encryption, complete transaction evidence and retry
authorization. The review does not claim fresh human approval or acceptance of
Apply Leave. Preview, edits, notice/overlap/bridge validation, document admission,
submission, approvals and the native UI remain outstanding.
