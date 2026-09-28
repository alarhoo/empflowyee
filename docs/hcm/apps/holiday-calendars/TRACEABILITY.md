# Holiday Calendars — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                                   | Design                          | Planned test                                              |
| ------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| [REQ-HOLIDAY-CALENDARS-001](FDD.md#req-holiday-calendars-001) | [DESIGN-001](TDD.md#design-001) | [TEST-HOLIDAY-CALENDARS-001](#test-holiday-calendars-001) |
| [REQ-HOLIDAY-CALENDARS-002](FDD.md#req-holiday-calendars-002) | [DESIGN-002](TDD.md#design-002) | [TEST-HOLIDAY-CALENDARS-002](#test-holiday-calendars-002) |
| [REQ-HOLIDAY-CALENDARS-003](FDD.md#req-holiday-calendars-003) | [DESIGN-003](TDD.md#design-003) | [TEST-HOLIDAY-CALENDARS-003](#test-holiday-calendars-003) |
| [REQ-HOLIDAY-CALENDARS-004](FDD.md#req-holiday-calendars-004) | [DESIGN-004](TDD.md#design-004) | [TEST-HOLIDAY-CALENDARS-004](#test-holiday-calendars-004) |
| [REQ-HOLIDAY-CALENDARS-005](FDD.md#req-holiday-calendars-005) | [DESIGN-005](TDD.md#design-005) | [TEST-HOLIDAY-CALENDARS-005](#test-holiday-calendars-005) |
| [REQ-HOLIDAY-CALENDARS-006](FDD.md#req-holiday-calendars-006) | [DESIGN-006](TDD.md#design-006) | [TEST-HOLIDAY-CALENDARS-006](#test-holiday-calendars-006) |

## TEST-HOLIDAY-CALENDARS-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-HOLIDAY-CALENDARS-001](FDD.md#req-holiday-calendars-001) through the declared API and relevant native UI.
Assert: Invalid partial ranges or unresolved collisions block preview/publication; observed dates are never silently guessed.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-HOLIDAY-CALENDARS-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-HOLIDAY-CALENDARS-002](FDD.md#req-holiday-calendars-002) through the declared API and relevant native UI.
Assert: A changed draft/workforce input makes the preview stale; publication freezes content and leaves historical referenced versions intact.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-HOLIDAY-CALENDARS-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-HOLIDAY-CALENDARS-003](FDD.md#req-holiday-calendars-003) through the declared API and relevant native UI.
Assert: Equal-precedence overlapping assignments fail and unrelated scopes keep their calendars.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-HOLIDAY-CALENDARS-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-HOLIDAY-CALENDARS-004](FDD.md#req-holiday-calendars-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-HOLIDAY-CALENDARS-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-HOLIDAY-CALENDARS-005](FDD.md#req-holiday-calendars-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-HOLIDAY-CALENDARS-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-HOLIDAY-CALENDARS-006](FDD.md#req-holiday-calendars-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
