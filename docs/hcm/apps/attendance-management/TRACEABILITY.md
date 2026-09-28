# Attendance Management — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                                           | Design                          | Planned test                                                      |
| --------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| [REQ-ATTENDANCE-MANAGEMENT-001](FDD.md#req-attendance-management-001) | [DESIGN-001](TDD.md#design-001) | [TEST-ATTENDANCE-MANAGEMENT-001](#test-attendance-management-001) |
| [REQ-ATTENDANCE-MANAGEMENT-002](FDD.md#req-attendance-management-002) | [DESIGN-002](TDD.md#design-002) | [TEST-ATTENDANCE-MANAGEMENT-002](#test-attendance-management-002) |
| [REQ-ATTENDANCE-MANAGEMENT-003](FDD.md#req-attendance-management-003) | [DESIGN-003](TDD.md#design-003) | [TEST-ATTENDANCE-MANAGEMENT-003](#test-attendance-management-003) |
| [REQ-ATTENDANCE-MANAGEMENT-004](FDD.md#req-attendance-management-004) | [DESIGN-004](TDD.md#design-004) | [TEST-ATTENDANCE-MANAGEMENT-004](#test-attendance-management-004) |
| [REQ-ATTENDANCE-MANAGEMENT-005](FDD.md#req-attendance-management-005) | [DESIGN-005](TDD.md#design-005) | [TEST-ATTENDANCE-MANAGEMENT-005](#test-attendance-management-005) |
| [REQ-ATTENDANCE-MANAGEMENT-006](FDD.md#req-attendance-management-006) | [DESIGN-006](TDD.md#design-006) | [TEST-ATTENDANCE-MANAGEMENT-006](#test-attendance-management-006) |
| [REQ-ATTENDANCE-MANAGEMENT-007](FDD.md#req-attendance-management-007) | [DESIGN-007](TDD.md#design-007) | [TEST-ATTENDANCE-MANAGEMENT-007](#test-attendance-management-007) |

## TEST-ATTENDANCE-MANAGEMENT-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-ATTENDANCE-MANAGEMENT-001](FDD.md#req-attendance-management-001) through the declared API and relevant native UI.
Assert: Events cannot be edited/deleted; run totals reflect failed items and identical input-digest retry does not duplicate results.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-ATTENDANCE-MANAGEMENT-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-ATTENDANCE-MANAGEMENT-002](FDD.md#req-attendance-management-002) through the declared API and relevant native UI.
Assert: Blocking waiver/adjustment follows independent approval; internal capture diagnostics stay in restricted views.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-ATTENDANCE-MANAGEMENT-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-ATTENDANCE-MANAGEMENT-003](FDD.md#req-attendance-management-003) through the declared API and relevant native UI.
Assert: Late events never mutate a locked basis; relock retains old/new/delta references and unresolved handoff remains a named exception.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-ATTENDANCE-MANAGEMENT-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-ATTENDANCE-MANAGEMENT-004](FDD.md#req-attendance-management-004) through the declared API and relevant native UI.
Assert: Duplicate acknowledgement returns existing outcome; conflicting consumer/digest is quarantined and Payroll is not fabricated.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-ATTENDANCE-MANAGEMENT-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-ATTENDANCE-MANAGEMENT-005](FDD.md#req-attendance-management-005) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-ATTENDANCE-MANAGEMENT-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-ATTENDANCE-MANAGEMENT-006](FDD.md#req-attendance-management-006) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-ATTENDANCE-MANAGEMENT-007

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-ATTENDANCE-MANAGEMENT-007](FDD.md#req-attendance-management-007) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
