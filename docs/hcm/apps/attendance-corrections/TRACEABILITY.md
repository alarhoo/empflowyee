# Attendance Corrections — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                                             | Design                          | Planned test                                                        |
| ----------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------- |
| [REQ-ATTENDANCE-CORRECTIONS-001](FDD.md#req-attendance-corrections-001) | [DESIGN-001](TDD.md#design-001) | [TEST-ATTENDANCE-CORRECTIONS-001](#test-attendance-corrections-001) |
| [REQ-ATTENDANCE-CORRECTIONS-002](FDD.md#req-attendance-corrections-002) | [DESIGN-002](TDD.md#design-002) | [TEST-ATTENDANCE-CORRECTIONS-002](#test-attendance-corrections-002) |
| [REQ-ATTENDANCE-CORRECTIONS-003](FDD.md#req-attendance-corrections-003) | [DESIGN-003](TDD.md#design-003) | [TEST-ATTENDANCE-CORRECTIONS-003](#test-attendance-corrections-003) |
| [REQ-ATTENDANCE-CORRECTIONS-004](FDD.md#req-attendance-corrections-004) | [DESIGN-004](TDD.md#design-004) | [TEST-ATTENDANCE-CORRECTIONS-004](#test-attendance-corrections-004) |
| [REQ-ATTENDANCE-CORRECTIONS-005](FDD.md#req-attendance-corrections-005) | [DESIGN-005](TDD.md#design-005) | [TEST-ATTENDANCE-CORRECTIONS-005](#test-attendance-corrections-005) |
| [REQ-ATTENDANCE-CORRECTIONS-006](FDD.md#req-attendance-corrections-006) | [DESIGN-006](TDD.md#design-006) | [TEST-ATTENDANCE-CORRECTIONS-006](#test-attendance-corrections-006) |

## TEST-ATTENDANCE-CORRECTIONS-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-ATTENDANCE-CORRECTIONS-001](FDD.md#req-attendance-corrections-001) through the declared API and relevant native UI.
Assert: Outside-window/locked/stale subjects are denied; timezone ambiguities and inconsistent correction items get explicit field errors.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-ATTENDANCE-CORRECTIONS-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-ATTENDANCE-CORRECTIONS-002](FDD.md#req-attendance-corrections-002) through the declared API and relevant native UI.
Assert: A material edit invalidates the pending case; an approver cannot apply a stale preview.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-ATTENDANCE-CORRECTIONS-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-ATTENDANCE-CORRECTIONS-003](FDD.md#req-attendance-corrections-003) through the declared API and relevant native UI.
Assert: Retry after a crash returns the existing applied result, never a second synthetic event; old result/decision remains available as history.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-ATTENDANCE-CORRECTIONS-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-ATTENDANCE-CORRECTIONS-004](FDD.md#req-attendance-corrections-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-ATTENDANCE-CORRECTIONS-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-ATTENDANCE-CORRECTIONS-005](FDD.md#req-attendance-corrections-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-ATTENDANCE-CORRECTIONS-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-ATTENDANCE-CORRECTIONS-006](FDD.md#req-attendance-corrections-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
