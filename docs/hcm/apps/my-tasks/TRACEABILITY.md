# My Tasks — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                 | Design                          | Planned test                            |
| ------------------------------------------- | ------------------------------- | --------------------------------------- |
| [REQ-MY-TASKS-001](FDD.md#req-my-tasks-001) | [DESIGN-001](TDD.md#design-001) | [TEST-MY-TASKS-001](#test-my-tasks-001) |
| [REQ-MY-TASKS-002](FDD.md#req-my-tasks-002) | [DESIGN-002](TDD.md#design-002) | [TEST-MY-TASKS-002](#test-my-tasks-002) |
| [REQ-MY-TASKS-003](FDD.md#req-my-tasks-003) | [DESIGN-003](TDD.md#design-003) | [TEST-MY-TASKS-003](#test-my-tasks-003) |
| [REQ-MY-TASKS-004](FDD.md#req-my-tasks-004) | [DESIGN-004](TDD.md#design-004) | [TEST-MY-TASKS-004](#test-my-tasks-004) |
| [REQ-MY-TASKS-005](FDD.md#req-my-tasks-005) | [DESIGN-005](TDD.md#design-005) | [TEST-MY-TASKS-005](#test-my-tasks-005) |
| [REQ-MY-TASKS-006](FDD.md#req-my-tasks-006) | [DESIGN-006](TDD.md#design-006) | [TEST-MY-TASKS-006](#test-my-tasks-006) |

## TEST-MY-TASKS-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-TASKS-001](FDD.md#req-my-tasks-001) through the declared API and relevant native UI.
Assert: Rows/counts disappear when source visibility or entitlement is revoked; an assignment is not authority.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-MY-TASKS-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-TASKS-002](FDD.md#req-my-tasks-002) through the declared API and relevant native UI.
Assert: Unsupported non-approval action is absent, and stale/unauthorized actions fail without domain writes.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-MY-TASKS-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-TASKS-003](FDD.md#req-my-tasks-003) through the declared API and relevant native UI.
Assert: Timeout never shows completed or permits a new-key duplicate; same-key replay returns the existing attempt.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-MY-TASKS-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-TASKS-004](FDD.md#req-my-tasks-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-MY-TASKS-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-TASKS-005](FDD.md#req-my-tasks-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-MY-TASKS-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-TASKS-006](FDD.md#req-my-tasks-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
