# Apply Leave — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                       | Design                          | Planned test                                  |
| ------------------------------------------------- | ------------------------------- | --------------------------------------------- |
| [REQ-APPLY-LEAVE-001](FDD.md#req-apply-leave-001) | [DESIGN-001](TDD.md#design-001) | [TEST-APPLY-LEAVE-001](#test-apply-leave-001) |
| [REQ-APPLY-LEAVE-002](FDD.md#req-apply-leave-002) | [DESIGN-002](TDD.md#design-002) | [TEST-APPLY-LEAVE-002](#test-apply-leave-002) |
| [REQ-APPLY-LEAVE-003](FDD.md#req-apply-leave-003) | [DESIGN-003](TDD.md#design-003) | [TEST-APPLY-LEAVE-003](#test-apply-leave-003) |
| [REQ-APPLY-LEAVE-004](FDD.md#req-apply-leave-004) | [DESIGN-004](TDD.md#design-004) | [TEST-APPLY-LEAVE-004](#test-apply-leave-004) |
| [REQ-APPLY-LEAVE-005](FDD.md#req-apply-leave-005) | [DESIGN-005](TDD.md#design-005) | [TEST-APPLY-LEAVE-005](#test-apply-leave-005) |
| [REQ-APPLY-LEAVE-006](FDD.md#req-apply-leave-006) | [DESIGN-006](TDD.md#design-006) | [TEST-APPLY-LEAVE-006](#test-apply-leave-006) |
| [REQ-APPLY-LEAVE-007](FDD.md#req-apply-leave-007) | [DESIGN-007](TDD.md#design-007) | [TEST-APPLY-LEAVE-007](#test-apply-leave-007) |

## TEST-APPLY-LEAVE-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPLY-LEAVE-001](FDD.md#req-apply-leave-001) through the declared API and relevant native UI.
Assert: Reject cross-period/policy-version requests, missing inputs and disallowed overlap; VAC notice below 3 days warns under the baseline.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-APPLY-LEAVE-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPLY-LEAVE-002](FDD.md#req-apply-leave-002) through the declared API and relevant native UI.
Assert: Concurrent spending cannot produce negative availability; evidence classification cannot be downgraded and failed submission creates no partial reservation.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-APPLY-LEAVE-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPLY-LEAVE-003](FDD.md#req-apply-leave-003) through the declared API and relevant native UI.
Assert: Withdrawal cancels pending case and releases any balance-tracked reservation once; a late decision cannot approve the withdrawn request.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-APPLY-LEAVE-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPLY-LEAVE-004](FDD.md#req-apply-leave-004) through the declared API and relevant native UI.
Assert: Partial cancellation preserves untouched days/history; repeated application cannot credit twice and material edits invalidate prior approval.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-APPLY-LEAVE-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPLY-LEAVE-005](FDD.md#req-apply-leave-005) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-APPLY-LEAVE-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPLY-LEAVE-006](FDD.md#req-apply-leave-006) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-APPLY-LEAVE-007

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-APPLY-LEAVE-007](FDD.md#req-apply-leave-007) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
