# Leave Policies — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                             | Design                          | Planned test                                        |
| ------------------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| [REQ-LEAVE-POLICIES-001](FDD.md#req-leave-policies-001) | [DESIGN-001](TDD.md#design-001) | [TEST-LEAVE-POLICIES-001](#test-leave-policies-001) |
| [REQ-LEAVE-POLICIES-002](FDD.md#req-leave-policies-002) | [DESIGN-002](TDD.md#design-002) | [TEST-LEAVE-POLICIES-002](#test-leave-policies-002) |
| [REQ-LEAVE-POLICIES-003](FDD.md#req-leave-policies-003) | [DESIGN-003](TDD.md#design-003) | [TEST-LEAVE-POLICIES-003](#test-leave-policies-003) |
| [REQ-LEAVE-POLICIES-004](FDD.md#req-leave-policies-004) | [DESIGN-004](TDD.md#design-004) | [TEST-LEAVE-POLICIES-004](#test-leave-policies-004) |
| [REQ-LEAVE-POLICIES-005](FDD.md#req-leave-policies-005) | [DESIGN-005](TDD.md#design-005) | [TEST-LEAVE-POLICIES-005](#test-leave-policies-005) |
| [REQ-LEAVE-POLICIES-006](FDD.md#req-leave-policies-006) | [DESIGN-006](TDD.md#design-006) | [TEST-LEAVE-POLICIES-006](#test-leave-policies-006) |
| [REQ-LEAVE-POLICIES-007](FDD.md#req-leave-policies-007) | [DESIGN-007](TDD.md#design-007) | [TEST-LEAVE-POLICIES-007](#test-leave-policies-007) |

## TEST-LEAVE-POLICIES-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-POLICIES-001](FDD.md#req-leave-policies-001) through the declared API and relevant native UI.
Assert: Seed drafts do not automatically grant unapproved statutory units; absent required parameters block publication instead of receiving hidden defaults.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-POLICIES-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-POLICIES-002](FDD.md#req-leave-policies-002) through the declared API and relevant native UI.
Assert: Preview changes no account; changed input/draft digest requires a new preview.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-POLICIES-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-POLICIES-003](FDD.md#req-leave-policies-003) through the declared API and relevant native UI.
Assert: A published rule cannot be edited; supersession preserves all referenced calculations and decision evidence.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-POLICIES-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-POLICIES-004](FDD.md#req-leave-policies-004) through the declared API and relevant native UI.
Assert: No template silently enables comp-off/encashment and no LOP balance bypass is invented.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-POLICIES-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-POLICIES-005](FDD.md#req-leave-policies-005) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-POLICIES-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-POLICIES-006](FDD.md#req-leave-policies-006) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-LEAVE-POLICIES-007

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-POLICIES-007](FDD.md#req-leave-policies-007) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
