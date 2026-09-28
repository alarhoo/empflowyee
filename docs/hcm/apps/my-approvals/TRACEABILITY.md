# My Approvals — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                         | Design                          | Planned test                                    |
| --------------------------------------------------- | ------------------------------- | ----------------------------------------------- |
| [REQ-MY-APPROVALS-001](FDD.md#req-my-approvals-001) | [DESIGN-001](TDD.md#design-001) | [TEST-MY-APPROVALS-001](#test-my-approvals-001) |
| [REQ-MY-APPROVALS-002](FDD.md#req-my-approvals-002) | [DESIGN-002](TDD.md#design-002) | [TEST-MY-APPROVALS-002](#test-my-approvals-002) |
| [REQ-MY-APPROVALS-003](FDD.md#req-my-approvals-003) | [DESIGN-003](TDD.md#design-003) | [TEST-MY-APPROVALS-003](#test-my-approvals-003) |
| [REQ-MY-APPROVALS-004](FDD.md#req-my-approvals-004) | [DESIGN-004](TDD.md#design-004) | [TEST-MY-APPROVALS-004](#test-my-approvals-004) |
| [REQ-MY-APPROVALS-005](FDD.md#req-my-approvals-005) | [DESIGN-005](TDD.md#design-005) | [TEST-MY-APPROVALS-005](#test-my-approvals-005) |
| [REQ-MY-APPROVALS-006](FDD.md#req-my-approvals-006) | [DESIGN-006](TDD.md#design-006) | [TEST-MY-APPROVALS-006](#test-my-approvals-006) |

## TEST-MY-APPROVALS-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-APPROVALS-001](FDD.md#req-my-approvals-001) through the declared API and relevant native UI.
Assert: Hidden source cases do not affect visible rows/counts; ordinary queues omit private reasons and evidence.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-MY-APPROVALS-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-APPROVALS-002](FDD.md#req-my-approvals-002) through the declared API and relevant native UI.
Assert: Source independently rechecks permission/scope/subject distinction/session/version; task claim does not grant authority.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-MY-APPROVALS-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-APPROVALS-003](FDD.md#req-my-approvals-003) through the declared API and relevant native UI.
Assert: Direct domain approval racing the inbox causes one durable source decision; retries do not repost leave or attendance effects.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-MY-APPROVALS-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-APPROVALS-004](FDD.md#req-my-approvals-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-MY-APPROVALS-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-APPROVALS-005](FDD.md#req-my-approvals-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-MY-APPROVALS-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-MY-APPROVALS-006](FDD.md#req-my-approvals-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
