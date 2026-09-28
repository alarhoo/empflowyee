# Team Attendance — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                               | Design                          | Planned test                                          |
| --------------------------------------------------------- | ------------------------------- | ----------------------------------------------------- |
| [REQ-TEAM-ATTENDANCE-001](FDD.md#req-team-attendance-001) | [DESIGN-001](TDD.md#design-001) | [TEST-TEAM-ATTENDANCE-001](#test-team-attendance-001) |
| [REQ-TEAM-ATTENDANCE-002](FDD.md#req-team-attendance-002) | [DESIGN-002](TDD.md#design-002) | [TEST-TEAM-ATTENDANCE-002](#test-team-attendance-002) |
| [REQ-TEAM-ATTENDANCE-003](FDD.md#req-team-attendance-003) | [DESIGN-003](TDD.md#design-003) | [TEST-TEAM-ATTENDANCE-003](#test-team-attendance-003) |
| [REQ-TEAM-ATTENDANCE-004](FDD.md#req-team-attendance-004) | [DESIGN-004](TDD.md#design-004) | [TEST-TEAM-ATTENDANCE-004](#test-team-attendance-004) |
| [REQ-TEAM-ATTENDANCE-005](FDD.md#req-team-attendance-005) | [DESIGN-005](TDD.md#design-005) | [TEST-TEAM-ATTENDANCE-005](#test-team-attendance-005) |
| [REQ-TEAM-ATTENDANCE-006](FDD.md#req-team-attendance-006) | [DESIGN-006](TDD.md#design-006) | [TEST-TEAM-ATTENDANCE-006](#test-team-attendance-006) |

## TEST-TEAM-ATTENDANCE-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-TEAM-ATTENDANCE-001](FDD.md#req-team-attendance-001) through the declared API and relevant native UI.
Assert: Current reporting changes alter rows/counts; no manager relationship creates permission.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-TEAM-ATTENDANCE-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-TEAM-ATTENDANCE-002](FDD.md#req-team-attendance-002) through the declared API and relevant native UI.
Assert: No IP, location precision, device assertion, private reason or unrelated leave detail enters response/search/export.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-TEAM-ATTENDANCE-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-TEAM-ATTENDANCE-003](FDD.md#req-team-attendance-003) through the declared API and relevant native UI.
Assert: Team visibility alone cannot create an approval or on-behalf correction; unavailable action is not a writable status cell.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-TEAM-ATTENDANCE-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-TEAM-ATTENDANCE-004](FDD.md#req-team-attendance-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-TEAM-ATTENDANCE-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-TEAM-ATTENDANCE-005](FDD.md#req-team-attendance-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-TEAM-ATTENDANCE-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-TEAM-ATTENDANCE-006](FDD.md#req-team-attendance-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
