# Leave Balance — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                           | Design                          | Planned test                                      |
| ----------------------------------------------------- | ------------------------------- | ------------------------------------------------- |
| [REQ-LEAVE-BALANCE-001](FDD.md#req-leave-balance-001) | [DESIGN-001](TDD.md#design-001) | [TEST-LEAVE-BALANCE-001](#test-leave-balance-001) |
| [REQ-LEAVE-BALANCE-002](FDD.md#req-leave-balance-002) | [DESIGN-002](TDD.md#design-002) | [TEST-LEAVE-BALANCE-002](#test-leave-balance-002) |
| [REQ-LEAVE-BALANCE-003](FDD.md#req-leave-balance-003) | [DESIGN-003](TDD.md#design-003) | [TEST-LEAVE-BALANCE-003](#test-leave-balance-003) |
| [REQ-LEAVE-BALANCE-004](FDD.md#req-leave-balance-004) | [DESIGN-004](TDD.md#design-004) | [TEST-LEAVE-BALANCE-004](#test-leave-balance-004) |
| [REQ-LEAVE-BALANCE-005](FDD.md#req-leave-balance-005) | [DESIGN-005](TDD.md#design-005) | [TEST-LEAVE-BALANCE-005](#test-leave-balance-005) |
| [REQ-LEAVE-BALANCE-006](FDD.md#req-leave-balance-006) | [DESIGN-006](TDD.md#design-006) | [TEST-LEAVE-BALANCE-006](#test-leave-balance-006) |

## TEST-LEAVE-BALANCE-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-BALANCE-001](FDD.md#req-leave-balance-001) through the declared API and relevant native UI.
Assert: Hidden policy omits protected totals, including counts/search/export paths; no shared balance across employments; Unpaid LOP displays tracked units without balance totals.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-BALANCE-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-BALANCE-002](FDD.md#req-leave-balance-002) through the declared API and relevant native UI.
Assert: Available units reconcile to ledger/projection; a pending request is a reservation rather than a posted debit.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-BALANCE-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-BALANCE-003](FDD.md#req-leave-balance-003) through the declared API and relevant native UI.
Assert: The balance screen cannot expose medical evidence or another person’s request and offers no balance editing.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-BALANCE-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-BALANCE-004](FDD.md#req-leave-balance-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-BALANCE-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-BALANCE-005](FDD.md#req-leave-balance-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-LEAVE-BALANCE-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-BALANCE-006](FDD.md#req-leave-balance-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
