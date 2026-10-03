# Work Schedules — requirement traceability

Status: implementation in progress, 2026-10-03. The acceptance obligations below
remain open until the complete app journey passes. Executed evidence is recorded
separately from those obligations; no Work Schedules browser acceptance is claimed.

## Executed implementation evidence

The [integration record](../../testing/HCM-3-WORK-SCHEDULES-INTEGRATION.md) records
the commands and limitations. The real
[PostgreSQL/API suite](../../../../libs/hcm/api/attendance/module/src/lib/work-configurations.database.spec.ts)
covers typed rule draft/publication, reviewed schedule/policy assignments, stale
evidence, durable workday production, safe inspection, authorization and tenant
isolation (requirements 001, 003, 004, 005 and 007, partial). It also exercises typed
roster/override storage and actual worker precedence using explicit disposable
fixtures. Real override Draft creation/read/preview now covers receipt recovery,
encrypted reasons, stale workdays and rolled-back proposed resolution. Reviewed
required-approval submission now covers concurrent duplicate recovery, persisted
case/slots/intake, encrypted reason, safe reload progress and current manage denial.
Evidence admission, decisions and full override acceptance remain open (002).
Override review also includes the first following scheduled workday, intervening
rest dates, independent rest outcomes, accumulated dated scope and the complete
period fence. The real API suite verifies the returned review horizon; the
[resolver tests](../../../../libs/hcm/api/attendance/application/src/lib/workday-location.spec.ts)
cover following-day blocks/warnings, intervening rest and unavailable/denied inputs
(003/004/005, partial). No new Work Schedules browser acceptance is claimed.
The [source decision evaluator tests](../../../../libs/hcm/api/attendance/domain/src/lib/source-approval.spec.ts)
cover staged all-required/any-reject rules and current-authority guards in isolation;
SQL fixture tests additionally cover complete source-case storage, stage guards,
immutable decisions and restricted runtime access. Required-case submission and
source-owned Workflow planning are implemented; dispatch, timers, receipt
reconciliation and completed source decisions remain required.
The [dated selection tests](../../../../libs/hcm/api/attendance/domain/src/lib/dated-source-selection.spec.ts)
cover precedence, ties and inactive sources. Existing exact-time/rest tests remain
the calculation evidence. Shared schedule/shift and policy form conversion tests
cover approved input restrictions. A production build confirms template typing;
requirement 006 still needs the Work Schedules real-browser journeys.

The routed override editor now reuses native interval controls and the existing
create/read/preview/required-approval submit APIs. Its
[pure form tests](../../../../libs/hcm/web/attendance/feature-work-schedules/src/lib/override-form.spec.ts)
cover explicit Work/Rest, reason/timezone boundaries, exact overnight precision,
overlap selection and incomplete intervals. This is partial 002/006 implementation;
it is not browser acceptance. The Planned catalogue guard remains enforced.

The [Leave request API suite](../../../../libs/hcm/api/leave/module/src/lib/requests.database.spec.ts)
also exercises the real override impact route against stored Balance/Unpaid
requests: retained quantities, exact hourly validation, safe counts, tenant-bound
reads and stale review after a new request. This covers the currently admitted
Draft lifecycle only (003/005/007, partial); full lifecycle impact remains open.

The same real API suite exercises no-required-slot override application: denial,
identical concurrent submission, atomic approval/outbox rollback on enqueue failure,
Pending workday inspection, real leased-worker publication, immutable Leave history
and original-key recovery after materialization (002/003/004/005/007, partial).
Configured independent approvals still remain pending; their final decisions are
not covered by this path. Browser acceptance remains outstanding.

`override-decision-test.ts`, invoked from the real configuration API suite,
exercises required independent stages through HTTP and the leased dispatch and
reconciliation handlers (002/003/005/007, partial). It covers original-key recovery,
rejection, revoked authority, stale input invalidation, atomic final-queue rollback,
source receipt integrity and tenant isolation. These internal dependencies do not
deliver Approve Attendance UI or Work Schedules browser acceptance.

| Requirement                                             | Design                          | Planned test                                        |
| ------------------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| [REQ-WORK-SCHEDULES-001](FDD.md#req-work-schedules-001) | [DESIGN-001](TDD.md#design-001) | [TEST-WORK-SCHEDULES-001](#test-work-schedules-001) |
| [REQ-WORK-SCHEDULES-002](FDD.md#req-work-schedules-002) | [DESIGN-002](TDD.md#design-002) | [TEST-WORK-SCHEDULES-002](#test-work-schedules-002) |
| [REQ-WORK-SCHEDULES-003](FDD.md#req-work-schedules-003) | [DESIGN-003](TDD.md#design-003) | [TEST-WORK-SCHEDULES-003](#test-work-schedules-003) |
| [REQ-WORK-SCHEDULES-004](FDD.md#req-work-schedules-004) | [DESIGN-004](TDD.md#design-004) | [TEST-WORK-SCHEDULES-004](#test-work-schedules-004) |
| [REQ-WORK-SCHEDULES-005](FDD.md#req-work-schedules-005) | [DESIGN-005](TDD.md#design-005) | [TEST-WORK-SCHEDULES-005](#test-work-schedules-005) |
| [REQ-WORK-SCHEDULES-006](FDD.md#req-work-schedules-006) | [DESIGN-006](TDD.md#design-006) | [TEST-WORK-SCHEDULES-006](#test-work-schedules-006) |
| [REQ-WORK-SCHEDULES-007](FDD.md#req-work-schedules-007) | [DESIGN-007](TDD.md#design-007) | [TEST-WORK-SCHEDULES-007](#test-work-schedules-007) |

## TEST-WORK-SCHEDULES-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULES-001](FDD.md#req-work-schedules-001) through the declared API and relevant native UI.
Assert: Derived planned minutes agree with resolved segments; unsupported variants and incomplete overtime/capture rules cannot publish.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORK-SCHEDULES-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULES-002](FDD.md#req-work-schedules-002) through the declared API and relevant native UI.
Assert: Equal-precedence conflicts block the day; a missing schedule is distinct from a deliberately unscheduled day.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORK-SCHEDULES-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULES-003](FDD.md#req-work-schedules-003) through the declared API and relevant native UI.
Assert: Changed source digests reject publication; open days receive new resolution revisions while locked history is preserved.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORK-SCHEDULES-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULES-004](FDD.md#req-work-schedules-004) through the declared API and relevant native UI.
Assert: A cross-midnight shift belongs to the start date and DST ambiguity never silently guesses an instant.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORK-SCHEDULES-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULES-005](FDD.md#req-work-schedules-005) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORK-SCHEDULES-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULES-006](FDD.md#req-work-schedules-006) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-WORK-SCHEDULES-007

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULES-007](FDD.md#req-work-schedules-007) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
