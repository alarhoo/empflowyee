# Holiday Calendars — requirement traceability

Status: design/test plan with partial backend evidence, 2026-09-28.
[Holiday command validation](../../testing/HCM-3-HOLIDAY-COMMAND-VALIDATION.md)
verifies Draft curation, exact replacement, immutable-source successor, current
root authorization and atomic encrypted receipts/audit. Owning
[application commands](../../../../libs/hcm/api/attendance/application/src/lib/holiday-commands.ts),
[SQL repository](../../../../libs/hcm/api/attendance/infrastructure/src/lib/holiday-repository.ts),
[transaction adapter](../../../../libs/hcm/api/attendance/infrastructure/src/lib/holiday-unit.ts)
and [PostgreSQL tests](../../../../libs/hcm/api/attendance/infrastructure/src/lib/holiday-commands.database.spec.ts)
cover backend portions of 001, 004 and 006. Migration 38 and the existing domain
boundary tests cover immutable storage and exact holiday resolution. Publication
impact, assignments and all native UI acceptance remain pending. The app
remains Planned; the full scenarios below are still acceptance obligations.

[Holiday API validation](../../testing/HCM-3-HOLIDAY-API-VALIDATION.md) adds five
real HTTP/SQL tests for the list/create/exact-version/update/successor routes,
authorization, safe projections and actor-bound continuation. Migration 43 proves
typed tenant references and compatibility with existing schedule cursors. These
extend backend evidence for 001, 004 and 006 without claiming publication or UI
acceptance.

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
