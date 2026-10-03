# Leave Administration — requirement traceability

Status: partial implementation evidence, 2026-10-03. The acceptance scenarios
below remain obligations; this is not UI or app completion. The
[enrollment integration record](../../testing/HCM-3-LEAVE-FOUNDATION.md#enrollment-command-integration)
records actual PostgreSQL/API checks for REQ-001/005/007: whole-date eligibility,
scoped access, concurrent retries, private evidence and empty-account/Unpaid
invariants. Internal ledger tests also exist; accrual operations, independent
adjustment approval, close and native UI acceptance remain outstanding.

| Requirement                                                         | Design                          | Planned test                                                    |
| ------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| [REQ-LEAVE-ADMINISTRATION-001](FDD.md#req-leave-administration-001) | [DESIGN-001](TDD.md#design-001) | [TEST-LEAVE-ADMINISTRATION-001](#test-leave-administration-001) |
| [REQ-LEAVE-ADMINISTRATION-002](FDD.md#req-leave-administration-002) | [DESIGN-002](TDD.md#design-002) | [TEST-LEAVE-ADMINISTRATION-002](#test-leave-administration-002) |
| [REQ-LEAVE-ADMINISTRATION-003](FDD.md#req-leave-administration-003) | [DESIGN-003](TDD.md#design-003) | [TEST-LEAVE-ADMINISTRATION-003](#test-leave-administration-003) |
| [REQ-LEAVE-ADMINISTRATION-004](FDD.md#req-leave-administration-004) | [DESIGN-004](TDD.md#design-004) | [TEST-LEAVE-ADMINISTRATION-004](#test-leave-administration-004) |
| [REQ-LEAVE-ADMINISTRATION-005](FDD.md#req-leave-administration-005) | [DESIGN-005](TDD.md#design-005) | [TEST-LEAVE-ADMINISTRATION-005](#test-leave-administration-005) |
| [REQ-LEAVE-ADMINISTRATION-006](FDD.md#req-leave-administration-006) | [DESIGN-006](TDD.md#design-006) | [TEST-LEAVE-ADMINISTRATION-006](#test-leave-administration-006) |
| [REQ-LEAVE-ADMINISTRATION-007](FDD.md#req-leave-administration-007) | [DESIGN-007](TDD.md#design-007) | [TEST-LEAVE-ADMINISTRATION-007](#test-leave-administration-007) |

## TEST-LEAVE-ADMINISTRATION-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-ADMINISTRATION-001](FDD.md#req-leave-administration-001) through the declared API and relevant native UI.
Assert: Incomplete/out-of-scope employment is denied; concurrent employments retain separate accounts and history.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-ADMINISTRATION-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-ADMINISTRATION-002](FDD.md#req-leave-administration-002) through the declared API and relevant native UI.
Assert: Same enrollment/rule/date posts once; failed items stay visible and run status is derived from actual outcomes.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-ADMINISTRATION-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-ADMINISTRATION-003](FDD.md#req-leave-administration-003) through the declared API and relevant native UI.
Assert: Maker cannot approve; a correction appends an adjustment/reversal and never updates a prior ledger row.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-ADMINISTRATION-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-ADMINISTRATION-004](FDD.md#req-leave-administration-004) through the declared API and relevant native UI.
Assert: Unresolved reservations/failures block close; late correction never edits a closed period.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-ADMINISTRATION-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-ADMINISTRATION-005](FDD.md#req-leave-administration-005) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-LEAVE-ADMINISTRATION-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-ADMINISTRATION-006](FDD.md#req-leave-administration-006) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-LEAVE-ADMINISTRATION-007

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-LEAVE-ADMINISTRATION-007](FDD.md#req-leave-administration-007) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
