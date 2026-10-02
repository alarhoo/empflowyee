# Holiday Calendars — requirement traceability

Status: locally accepted FDD scope, 2026-10-03.
The [validation record](../../testing/HCM-3-HOLIDAY-PUBLICATION-VALIDATION.md)
records normal-production-build discovery and business journeys.

| Requirement | Implementation and executed evidence |
| --- | --- |
| 001 | [Draft commands](../../../../libs/hcm/api/attendance/application/src/lib/holiday-commands.ts), [editor](../../../../libs/hcm/web/attendance/feature-holiday-calendars/src/lib/editor.component.ts), [form tests](../../../../libs/hcm/web/attendance/feature-holiday-calendars/src/lib/holiday-form.spec.ts), existing [draft API evidence](../../testing/HCM-3-HOLIDAY-API-VALIDATION.md) |
| 002 | [Publication application](../../../../libs/hcm/api/attendance/application/src/lib/holiday-publication.ts), [durable worker](../../../../libs/hcm/api/attendance/infrastructure/src/lib/holiday-previews.ts), [HTTP/SQL tests](../../../../libs/hcm/api/attendance/module/src/lib/holiday-publication.database.spec.ts), immutable migration 47 context |
| 003 | [Assignment command](../../../../libs/hcm/api/attendance/application/src/lib/holiday-assignments.ts), [transaction adapter](../../../../libs/hcm/api/attendance/infrastructure/src/lib/holiday-assignment-unit.ts), same-target exclusion and actual-zone checks in the HTTP/SQL suite |
| 004 | Current independent operations, complete-grant assignment authorization, foreign-tenant and revoked-grant denial in the HTTP/SQL suite; [batch scope tests](../../../../libs/hcm/api/access-control/infrastructure/src/lib/grant-scope.database.spec.ts) |
| 005 | [Native browser journeys](../../../../libs/hcm/api/attendance/module/src/lib/holidays-browser.spec.ts): validation, reload, publication, assignment/supersession, lost response recovery, dirty navigation, keyboard/narrow FCL; production discovery and denial checked separately |
| 006 | Atomic assignment/source publication, encrypted reasons, audit, receipts and durable worker intents in HTTP/SQL tests; existing [command rollback/concurrency evidence](../../testing/HCM-3-HOLIDAY-COMMAND-VALIDATION.md) |

The scenarios below retain the stable acceptance identifiers. Source-owned
workday production queues only the command's explicit resolution window;
missing schedule/policy configuration remains Unavailable.

| Requirement                                                   | Design                          | Acceptance test                                              |
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
Verification suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-HOLIDAY-CALENDARS-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-HOLIDAY-CALENDARS-002](FDD.md#req-holiday-calendars-002) through the declared API and relevant native UI.
Assert: A changed draft/workforce input makes the preview stale; publication freezes content and leaves historical referenced versions intact.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Verification suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-HOLIDAY-CALENDARS-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-HOLIDAY-CALENDARS-003](FDD.md#req-holiday-calendars-003) through the declared API and relevant native UI.
Assert: Equal-precedence overlapping assignments fail and unrelated scopes keep their calendars.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Verification suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-HOLIDAY-CALENDARS-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-HOLIDAY-CALENDARS-004](FDD.md#req-holiday-calendars-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Verification suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-HOLIDAY-CALENDARS-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-HOLIDAY-CALENDARS-005](FDD.md#req-holiday-calendars-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Verification suite: browser accessibility/interaction plus HTTP projection.

## TEST-HOLIDAY-CALENDARS-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-HOLIDAY-CALENDARS-006](FDD.md#req-holiday-calendars-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Verification suite: PostgreSQL/API integration plus domain boundary cases.
