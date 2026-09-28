# Shift Planning — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                             | Design                          | Planned test                                        |
| ------------------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| [REQ-SHIFT-PLANNING-001](FDD.md#req-shift-planning-001) | [DESIGN-001](TDD.md#design-001) | [TEST-SHIFT-PLANNING-001](#test-shift-planning-001) |
| [REQ-SHIFT-PLANNING-002](FDD.md#req-shift-planning-002) | [DESIGN-002](TDD.md#design-002) | [TEST-SHIFT-PLANNING-002](#test-shift-planning-002) |
| [REQ-SHIFT-PLANNING-003](FDD.md#req-shift-planning-003) | [DESIGN-003](TDD.md#design-003) | [TEST-SHIFT-PLANNING-003](#test-shift-planning-003) |
| [REQ-SHIFT-PLANNING-004](FDD.md#req-shift-planning-004) | [DESIGN-004](TDD.md#design-004) | [TEST-SHIFT-PLANNING-004](#test-shift-planning-004) |
| [REQ-SHIFT-PLANNING-005](FDD.md#req-shift-planning-005) | [DESIGN-005](TDD.md#design-005) | [TEST-SHIFT-PLANNING-005](#test-shift-planning-005) |
| [REQ-SHIFT-PLANNING-006](FDD.md#req-shift-planning-006) | [DESIGN-006](TDD.md#design-006) | [TEST-SHIFT-PLANNING-006](#test-shift-planning-006) |

## TEST-SHIFT-PLANNING-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-SHIFT-PLANNING-001](FDD.md#req-shift-planning-001) through the declared API and relevant native UI.
Assert: Entries outside employment/planner scope, overlapping shifts and prohibited rest gaps block validation.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-SHIFT-PLANNING-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-SHIFT-PLANNING-002](FDD.md#req-shift-planning-002) through the declared API and relevant native UI.
Assert: Stale digest cannot publish and required roster approval cannot be skipped by a planner title.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-SHIFT-PLANNING-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-SHIFT-PLANNING-003](FDD.md#req-shift-planning-003) through the declared API and relevant native UI.
Assert: Published entries remain immutable; late changes respect lock/delta rules and failed notification does not invent a second roster.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-SHIFT-PLANNING-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-SHIFT-PLANNING-004](FDD.md#req-shift-planning-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-SHIFT-PLANNING-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-SHIFT-PLANNING-005](FDD.md#req-shift-planning-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-SHIFT-PLANNING-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-SHIFT-PLANNING-006](FDD.md#req-shift-planning-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
