# Approve Attendance — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                                     | Design                          | Planned test                                                |
| --------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| [REQ-APPROVE-ATTENDANCE-001](FDD.md#req-approve-attendance-001) | [DESIGN-001](TDD.md#design-001) | [TEST-APPROVE-ATTENDANCE-001](#test-approve-attendance-001) |
| [REQ-APPROVE-ATTENDANCE-002](FDD.md#req-approve-attendance-002) | [DESIGN-002](TDD.md#design-002) | [TEST-APPROVE-ATTENDANCE-002](#test-approve-attendance-002) |
| [REQ-APPROVE-ATTENDANCE-003](FDD.md#req-approve-attendance-003) | [DESIGN-003](TDD.md#design-003) | [TEST-APPROVE-ATTENDANCE-003](#test-approve-attendance-003) |
| [REQ-APPROVE-ATTENDANCE-004](FDD.md#req-approve-attendance-004) | [DESIGN-004](TDD.md#design-004) | [TEST-APPROVE-ATTENDANCE-004](#test-approve-attendance-004) |
| [REQ-APPROVE-ATTENDANCE-005](FDD.md#req-approve-attendance-005) | [DESIGN-005](TDD.md#design-005) | [TEST-APPROVE-ATTENDANCE-005](#test-approve-attendance-005) |
| [REQ-APPROVE-ATTENDANCE-006](FDD.md#req-approve-attendance-006) | [DESIGN-006](TDD.md#design-006) | [TEST-APPROVE-ATTENDANCE-006](#test-approve-attendance-006) |

## TEST-APPROVE-ATTENDANCE-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPROVE-ATTENDANCE-001](FDD.md#req-approve-attendance-001) through the declared API and relevant native UI.
Assert: Hidden capture assertions/private narrative are excluded from ordinary queue rows and counts.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-APPROVE-ATTENDANCE-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPROVE-ATTENDANCE-002](FDD.md#req-approve-attendance-002) through the declared API and relevant native UI.
Assert: Self/maker decision, revoked authority, stale result or changed period fails without applying the subject.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-APPROVE-ATTENDANCE-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPROVE-ATTENDANCE-003](FDD.md#req-approve-attendance-003) through the declared API and relevant native UI.
Assert: Workflow and direct-screen races cannot decide twice; no timer, task or operator marks a domain case approved.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-APPROVE-ATTENDANCE-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPROVE-ATTENDANCE-004](FDD.md#req-approve-attendance-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-APPROVE-ATTENDANCE-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPROVE-ATTENDANCE-005](FDD.md#req-approve-attendance-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-APPROVE-ATTENDANCE-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPROVE-ATTENDANCE-006](FDD.md#req-approve-attendance-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
