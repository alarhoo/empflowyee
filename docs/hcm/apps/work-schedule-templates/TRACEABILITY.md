# Work Schedule Templates — requirement traceability

Status: implemented acceptance mapping, 2026-09-28. Codex technical review under
[delegated authority](../../roadmap/HCM-3-DESIGN-APPROVAL.md#authority).
The [UI acceptance record](../../testing/HCM-3-TEMPLATE-UI-VALIDATION.md) covers
native interaction and end-to-end production-build behavior. The
[command](../../testing/HCM-3-CONFIGURATION-COMMAND-VALIDATION.md),
[publication](../../testing/HCM-3-TEMPLATE-PUBLICATION-VALIDATION.md),
[HTTP API](../../testing/HCM-3-TEMPLATE-API-VALIDATION.md) and
[seed](../../testing/HCM-3-SEED-DEFAULTS-VALIDATION.md) records cover the source
boundary. This app's completion does not claim downstream Work Schedules or
workday publication is complete.

Implementation paths: [contracts](../../../../libs/hcm/contracts/attendance/src/lib),
[application](../../../../libs/hcm/api/attendance/application/src/lib),
[SQL/repositories](../../../../libs/hcm/api/attendance/infrastructure/src/lib),
[HTTP](../../../../libs/hcm/api/attendance/transport/src/lib),
[data access](../../../../libs/hcm/web/attendance/data-access/src/lib/schedule-templates-api.ts),
[native feature](../../../../libs/hcm/web/attendance/feature-work-schedule-templates/src/lib).
SQL migrations 37 and 40-42 own this app's schedule, command/preview, cursor and
seed-default persistence; no UI-slice migration is required.

| Requirements  | Executed suite / assertions                                                                                                                                                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001, 003, 006 | [SQL commands](../../../../libs/hcm/api/attendance/infrastructure/src/lib/schedule-commands.database.spec.ts): independent copy mutation, immutable source, retirement, successor, concurrent replay, rollback and expiry                                                                                                    |
| 002, 004      | [SQL storage](../../../../libs/hcm/api/attendance/infrastructure/src/lib/attendance-schedules.database.spec.ts): template assignment denial and tenant composite references; [HTTP](../../../../libs/hcm/api/attendance/module/src/lib/schedule-templates.database.spec.ts): scoped/revoked/foreign authority and validation |
| 001-006       | [Browser](../../../../libs/hcm/api/attendance/module/src/lib/templates-browser.spec.ts): production native routes, lifecycle, invalid submit, receipt recovery, keyboard/focus, responsive layout, exact time and delayed response clearing                                                                                  |
| 002, 005      | [Form model](../../../../libs/hcm/web/attendance/feature-work-schedule-templates/src/lib/schedule-form.spec.ts): incomplete seed, explicit breaks, minimum-rest opt-in, DST overlap/cross-midnight precision and invalid boundaries                                                                                          |

| Requirement                                                               | Design                          | Acceptance scenario                                                   |
| ------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| [REQ-WORK-SCHEDULE-TEMPLATES-001](FDD.md#req-work-schedule-templates-001) | [DESIGN-001](TDD.md#design-001) | [TEST-WORK-SCHEDULE-TEMPLATES-001](#test-work-schedule-templates-001) |
| [REQ-WORK-SCHEDULE-TEMPLATES-002](FDD.md#req-work-schedule-templates-002) | [DESIGN-002](TDD.md#design-002) | [TEST-WORK-SCHEDULE-TEMPLATES-002](#test-work-schedule-templates-002) |
| [REQ-WORK-SCHEDULE-TEMPLATES-003](FDD.md#req-work-schedule-templates-003) | [DESIGN-003](TDD.md#design-003) | [TEST-WORK-SCHEDULE-TEMPLATES-003](#test-work-schedule-templates-003) |
| [REQ-WORK-SCHEDULE-TEMPLATES-004](FDD.md#req-work-schedule-templates-004) | [DESIGN-004](TDD.md#design-004) | [TEST-WORK-SCHEDULE-TEMPLATES-004](#test-work-schedule-templates-004) |
| [REQ-WORK-SCHEDULE-TEMPLATES-005](FDD.md#req-work-schedule-templates-005) | [DESIGN-005](TDD.md#design-005) | [TEST-WORK-SCHEDULE-TEMPLATES-005](#test-work-schedule-templates-005) |
| [REQ-WORK-SCHEDULE-TEMPLATES-006](FDD.md#req-work-schedule-templates-006) | [DESIGN-006](TDD.md#design-006) | [TEST-WORK-SCHEDULE-TEMPLATES-006](#test-work-schedule-templates-006) |

## TEST-WORK-SCHEDULE-TEMPLATES-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULE-TEMPLATES-001](FDD.md#req-work-schedule-templates-001) through the declared API and relevant native UI.
Assert: Copying preserves source attribution; editing the copy never changes the template or any assigned schedule.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Executed suite mapping above; required coverage: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORK-SCHEDULE-TEMPLATES-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULE-TEMPLATES-002](FDD.md#req-work-schedule-templates-002) through the declared API and relevant native UI.
Assert: A template ID supplied as a live assignment is denied; conflicting segments produce field-specific errors.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Executed suite mapping above; required coverage: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORK-SCHEDULE-TEMPLATES-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULE-TEMPLATES-003](FDD.md#req-work-schedule-templates-003) through the declared API and relevant native UI.
Assert: Previously copied/published schedules remain unchanged and a retired template is unavailable for new copies.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Executed suite mapping above; required coverage: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORK-SCHEDULE-TEMPLATES-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULE-TEMPLATES-004](FDD.md#req-work-schedule-templates-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Executed suite mapping above; required coverage: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORK-SCHEDULE-TEMPLATES-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULE-TEMPLATES-005](FDD.md#req-work-schedule-templates-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Executed suite mapping above; required coverage: browser accessibility/interaction plus HTTP projection.

## TEST-WORK-SCHEDULE-TEMPLATES-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULE-TEMPLATES-006](FDD.md#req-work-schedule-templates-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Executed suite mapping above; required coverage: PostgreSQL/API integration plus domain boundary cases.
