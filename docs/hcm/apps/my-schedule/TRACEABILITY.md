# My Schedule — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                       | Design                          | Planned test                                  |
| ------------------------------------------------- | ------------------------------- | --------------------------------------------- |
| [REQ-MY-SCHEDULE-001](FDD.md#req-my-schedule-001) | [DESIGN-001](TDD.md#design-001) | [TEST-MY-SCHEDULE-001](#test-my-schedule-001) |
| [REQ-MY-SCHEDULE-002](FDD.md#req-my-schedule-002) | [DESIGN-002](TDD.md#design-002) | [TEST-MY-SCHEDULE-002](#test-my-schedule-002) |
| [REQ-MY-SCHEDULE-003](FDD.md#req-my-schedule-003) | [DESIGN-003](TDD.md#design-003) | [TEST-MY-SCHEDULE-003](#test-my-schedule-003) |
| [REQ-MY-SCHEDULE-004](FDD.md#req-my-schedule-004) | [DESIGN-004](TDD.md#design-004) | [TEST-MY-SCHEDULE-004](#test-my-schedule-004) |
| [REQ-MY-SCHEDULE-005](FDD.md#req-my-schedule-005) | [DESIGN-005](TDD.md#design-005) | [TEST-MY-SCHEDULE-005](#test-my-schedule-005) |
| [REQ-MY-SCHEDULE-006](FDD.md#req-my-schedule-006) | [DESIGN-006](TDD.md#design-006) | [TEST-MY-SCHEDULE-006](#test-my-schedule-006) |

## TEST-MY-SCHEDULE-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-SCHEDULE-001](FDD.md#req-my-schedule-001) through the declared API and relevant native UI.
Assert: Foreign employment selection is hidden; missing/conflicted input appears unavailable rather than a fabricated default.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-MY-SCHEDULE-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-SCHEDULE-002](FDD.md#req-my-schedule-002) through the declared API and relevant native UI.
Assert: Cross-midnight and offset changes display the actual intervals without shifting a calendar date by the viewer’s timezone.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-MY-SCHEDULE-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-SCHEDULE-003](FDD.md#req-my-schedule-003) through the declared API and relevant native UI.
Assert: A superseded workday is labelled as history and never displayed as the current plan; no schedule write action is exposed.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-MY-SCHEDULE-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-SCHEDULE-004](FDD.md#req-my-schedule-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-MY-SCHEDULE-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-SCHEDULE-005](FDD.md#req-my-schedule-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-MY-SCHEDULE-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-SCHEDULE-006](FDD.md#req-my-schedule-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
