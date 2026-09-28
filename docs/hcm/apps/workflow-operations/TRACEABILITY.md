# Workflow Operations — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                                       | Design                          | Planned test                                                  |
| ----------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------- |
| [REQ-WORKFLOW-OPERATIONS-001](FDD.md#req-workflow-operations-001) | [DESIGN-001](TDD.md#design-001) | [TEST-WORKFLOW-OPERATIONS-001](#test-workflow-operations-001) |
| [REQ-WORKFLOW-OPERATIONS-002](FDD.md#req-workflow-operations-002) | [DESIGN-002](TDD.md#design-002) | [TEST-WORKFLOW-OPERATIONS-002](#test-workflow-operations-002) |
| [REQ-WORKFLOW-OPERATIONS-003](FDD.md#req-workflow-operations-003) | [DESIGN-003](TDD.md#design-003) | [TEST-WORKFLOW-OPERATIONS-003](#test-workflow-operations-003) |
| [REQ-WORKFLOW-OPERATIONS-004](FDD.md#req-workflow-operations-004) | [DESIGN-004](TDD.md#design-004) | [TEST-WORKFLOW-OPERATIONS-004](#test-workflow-operations-004) |
| [REQ-WORKFLOW-OPERATIONS-005](FDD.md#req-workflow-operations-005) | [DESIGN-005](TDD.md#design-005) | [TEST-WORKFLOW-OPERATIONS-005](#test-workflow-operations-005) |
| [REQ-WORKFLOW-OPERATIONS-006](FDD.md#req-workflow-operations-006) | [DESIGN-006](TDD.md#design-006) | [TEST-WORKFLOW-OPERATIONS-006](#test-workflow-operations-006) |
| [REQ-WORKFLOW-OPERATIONS-007](FDD.md#req-workflow-operations-007) | [DESIGN-007](TDD.md#design-007) | [TEST-WORKFLOW-OPERATIONS-007](#test-workflow-operations-007) |

## TEST-WORKFLOW-OPERATIONS-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORKFLOW-OPERATIONS-001](FDD.md#req-workflow-operations-001) through the declared API and relevant native UI.
Assert: Private summaries/reasons and cross-scope existence are omitted; operator title cannot authorize source reads or actions.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORKFLOW-OPERATIONS-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORKFLOW-OPERATIONS-002](FDD.md#req-workflow-operations-002) through the declared API and relevant native UI.
Assert: Unknown delivery is never resent with a new key; no operator force-complete or direct source status write exists.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORKFLOW-OPERATIONS-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORKFLOW-OPERATIONS-003](FDD.md#req-workflow-operations-003) through the declared API and relevant native UI.
Assert: Unknown action outcome, identity mismatch and blocking source drift cannot be accepted as risk or marked successful.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORKFLOW-OPERATIONS-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORKFLOW-OPERATIONS-004](FDD.md#req-workflow-operations-004) through the declared API and relevant native UI.
Assert: Timer completion is not domain approval and a stopped worker resumes durable due work without duplicate effects.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORKFLOW-OPERATIONS-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORKFLOW-OPERATIONS-005](FDD.md#req-workflow-operations-005) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-WORKFLOW-OPERATIONS-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORKFLOW-OPERATIONS-006](FDD.md#req-workflow-operations-006) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-WORKFLOW-OPERATIONS-007

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-WORKFLOW-OPERATIONS-007](FDD.md#req-workflow-operations-007) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
