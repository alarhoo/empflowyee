# Workflow Definitions — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                                         | Design                          | Planned test                                                    |
| ------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| [REQ-WORKFLOW-DEFINITIONS-001](FDD.md#req-workflow-definitions-001) | [DESIGN-001](TDD.md#design-001) | [TEST-WORKFLOW-DEFINITIONS-001](#test-workflow-definitions-001) |
| [REQ-WORKFLOW-DEFINITIONS-002](FDD.md#req-workflow-definitions-002) | [DESIGN-002](TDD.md#design-002) | [TEST-WORKFLOW-DEFINITIONS-002](#test-workflow-definitions-002) |
| [REQ-WORKFLOW-DEFINITIONS-003](FDD.md#req-workflow-definitions-003) | [DESIGN-003](TDD.md#design-003) | [TEST-WORKFLOW-DEFINITIONS-003](#test-workflow-definitions-003) |
| [REQ-WORKFLOW-DEFINITIONS-004](FDD.md#req-workflow-definitions-004) | [DESIGN-004](TDD.md#design-004) | [TEST-WORKFLOW-DEFINITIONS-004](#test-workflow-definitions-004) |
| [REQ-WORKFLOW-DEFINITIONS-005](FDD.md#req-workflow-definitions-005) | [DESIGN-005](TDD.md#design-005) | [TEST-WORKFLOW-DEFINITIONS-005](#test-workflow-definitions-005) |
| [REQ-WORKFLOW-DEFINITIONS-006](FDD.md#req-workflow-definitions-006) | [DESIGN-006](TDD.md#design-006) | [TEST-WORKFLOW-DEFINITIONS-006](#test-workflow-definitions-006) |

## TEST-WORKFLOW-DEFINITIONS-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORKFLOW-DEFINITIONS-001](FDD.md#req-workflow-definitions-001) through the declared API and relevant native UI.
Assert: Scripts/arbitrary URLs/unregistered actions or incompatible facts are rejected; the definition cannot weaken source required slots.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORKFLOW-DEFINITIONS-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORKFLOW-DEFINITIONS-002](FDD.md#req-workflow-definitions-002) through the declared API and relevant native UI.
Assert: Preview mutates no source case; source or draft changes invalidate its digest.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORKFLOW-DEFINITIONS-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORKFLOW-DEFINITIONS-003](FDD.md#req-workflow-definitions-003) through the declared API and relevant native UI.
Assert: Published children cannot be edited; existing instances retain their accepted graph/manifest and retired versions stop future selection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORKFLOW-DEFINITIONS-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORKFLOW-DEFINITIONS-004](FDD.md#req-workflow-definitions-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORKFLOW-DEFINITIONS-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORKFLOW-DEFINITIONS-005](FDD.md#req-workflow-definitions-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-WORKFLOW-DEFINITIONS-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORKFLOW-DEFINITIONS-006](FDD.md#req-workflow-definitions-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
