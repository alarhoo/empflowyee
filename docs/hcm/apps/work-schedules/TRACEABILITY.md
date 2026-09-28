# Work Schedules — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

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
