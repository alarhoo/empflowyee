# Work Schedule Templates — requirement traceability

Status: design/test plan with partial implementation evidence, 2026-09-28.
The [command](../../testing/HCM-3-CONFIGURATION-COMMAND-VALIDATION.md),
[publication](../../testing/HCM-3-TEMPLATE-PUBLICATION-VALIDATION.md) and
[HTTP API](../../testing/HCM-3-TEMPLATE-API-VALIDATION.md) suites verify backend
parts of requirements 001–004 and 006. Contract/domain/storage suites cover segment
validation and template assignment denial. Requirement 005 and native UI portions
of every journey remain pending. Canonical seed defaults/grants are now verified in
[seed validation](../../testing/HCM-3-SEED-DEFAULTS-VALIDATION.md). The app
remains Planned. The scenarios below remain the full acceptance obligations;
backend tests alone do not approve the floorplan or complete an app.

| Requirement                                                               | Design                          | Planned test                                                          |
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
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORK-SCHEDULE-TEMPLATES-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULE-TEMPLATES-002](FDD.md#req-work-schedule-templates-002) through the declared API and relevant native UI.
Assert: A template ID supplied as a live assignment is denied; conflicting segments produce field-specific errors.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORK-SCHEDULE-TEMPLATES-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULE-TEMPLATES-003](FDD.md#req-work-schedule-templates-003) through the declared API and relevant native UI.
Assert: Previously copied/published schedules remain unchanged and a retired template is unavailable for new copies.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORK-SCHEDULE-TEMPLATES-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULE-TEMPLATES-004](FDD.md#req-work-schedule-templates-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORK-SCHEDULE-TEMPLATES-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULE-TEMPLATES-005](FDD.md#req-work-schedule-templates-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-WORK-SCHEDULE-TEMPLATES-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORK-SCHEDULE-TEMPLATES-006](FDD.md#req-work-schedule-templates-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
