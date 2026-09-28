# Team Calendar — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                           | Design                          | Planned test                                      |
| ----------------------------------------------------- | ------------------------------- | ------------------------------------------------- |
| [REQ-TEAM-CALENDAR-001](FDD.md#req-team-calendar-001) | [DESIGN-001](TDD.md#design-001) | [TEST-TEAM-CALENDAR-001](#test-team-calendar-001) |
| [REQ-TEAM-CALENDAR-002](FDD.md#req-team-calendar-002) | [DESIGN-002](TDD.md#design-002) | [TEST-TEAM-CALENDAR-002](#test-team-calendar-002) |
| [REQ-TEAM-CALENDAR-003](FDD.md#req-team-calendar-003) | [DESIGN-003](TDD.md#design-003) | [TEST-TEAM-CALENDAR-003](#test-team-calendar-003) |
| [REQ-TEAM-CALENDAR-004](FDD.md#req-team-calendar-004) | [DESIGN-004](TDD.md#design-004) | [TEST-TEAM-CALENDAR-004](#test-team-calendar-004) |
| [REQ-TEAM-CALENDAR-005](FDD.md#req-team-calendar-005) | [DESIGN-005](TDD.md#design-005) | [TEST-TEAM-CALENDAR-005](#test-team-calendar-005) |
| [REQ-TEAM-CALENDAR-006](FDD.md#req-team-calendar-006) | [DESIGN-006](TDD.md#design-006) | [TEST-TEAM-CALENDAR-006](#test-team-calendar-006) |

## TEST-TEAM-CALENDAR-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-TEAM-CALENDAR-001](FDD.md#req-team-calendar-001) through the declared API and relevant native UI.
Assert: Revoking team permission or changing the reporting line removes rows and counts immediately; no tenant-wide manager fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-TEAM-CALENDAR-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-TEAM-CALENDAR-002](FDD.md#req-team-calendar-002) through the declared API and relevant native UI.
Assert: No reason, medical label, approval reason, attachment, balance or hidden leave type can be inferred from search, counts, sorting or detail.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-TEAM-CALENDAR-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-TEAM-CALENDAR-003](FDD.md#req-team-calendar-003) through the declared API and relevant native UI.
Assert: Keyboard/date selection works at phone width; no generic detail endpoint grants more data than the team projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-TEAM-CALENDAR-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-TEAM-CALENDAR-004](FDD.md#req-team-calendar-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-TEAM-CALENDAR-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-TEAM-CALENDAR-005](FDD.md#req-team-calendar-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-TEAM-CALENDAR-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-TEAM-CALENDAR-006](FDD.md#req-team-calendar-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
