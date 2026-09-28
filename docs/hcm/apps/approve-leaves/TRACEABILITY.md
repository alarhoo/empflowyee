# Approve Leaves — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                             | Design                          | Planned test                                        |
| ------------------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| [REQ-APPROVE-LEAVES-001](FDD.md#req-approve-leaves-001) | [DESIGN-001](TDD.md#design-001) | [TEST-APPROVE-LEAVES-001](#test-approve-leaves-001) |
| [REQ-APPROVE-LEAVES-002](FDD.md#req-approve-leaves-002) | [DESIGN-002](TDD.md#design-002) | [TEST-APPROVE-LEAVES-002](#test-approve-leaves-002) |
| [REQ-APPROVE-LEAVES-003](FDD.md#req-approve-leaves-003) | [DESIGN-003](TDD.md#design-003) | [TEST-APPROVE-LEAVES-003](#test-approve-leaves-003) |
| [REQ-APPROVE-LEAVES-004](FDD.md#req-approve-leaves-004) | [DESIGN-004](TDD.md#design-004) | [TEST-APPROVE-LEAVES-004](#test-approve-leaves-004) |
| [REQ-APPROVE-LEAVES-005](FDD.md#req-approve-leaves-005) | [DESIGN-005](TDD.md#design-005) | [TEST-APPROVE-LEAVES-005](#test-approve-leaves-005) |
| [REQ-APPROVE-LEAVES-006](FDD.md#req-approve-leaves-006) | [DESIGN-006](TDD.md#design-006) | [TEST-APPROVE-LEAVES-006](#test-approve-leaves-006) |

## TEST-APPROVE-LEAVES-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPROVE-LEAVES-001](FDD.md#req-approve-leaves-001) through the declared API and relevant native UI.
Assert: Assignment alone never reveals a hidden case; medical/private evidence is absent from ordinary case projections.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-APPROVE-LEAVES-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPROVE-LEAVES-002](FDD.md#req-approve-leaves-002) through the declared API and relevant native UI.
Assert: Recheck authority, independence, slot and subject version in transaction; simultaneous decisions accept at most one result per slot.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-APPROVE-LEAVES-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPROVE-LEAVES-003](FDD.md#req-approve-leaves-003) through the declared API and relevant native UI.
Assert: Elapsed time never approves; Workflow/direct-screen races share one source decision receipt and cannot duplicate posting.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-APPROVE-LEAVES-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPROVE-LEAVES-004](FDD.md#req-approve-leaves-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-APPROVE-LEAVES-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPROVE-LEAVES-005](FDD.md#req-approve-leaves-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-APPROVE-LEAVES-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPROVE-LEAVES-006](FDD.md#req-approve-leaves-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
