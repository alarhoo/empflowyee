# Comp Off Administration — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                                               | Design                          | Planned test                                                          |
| ------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| [REQ-COMP-OFF-ADMINISTRATION-001](FDD.md#req-comp-off-administration-001) | [DESIGN-001](TDD.md#design-001) | [TEST-COMP-OFF-ADMINISTRATION-001](#test-comp-off-administration-001) |
| [REQ-COMP-OFF-ADMINISTRATION-002](FDD.md#req-comp-off-administration-002) | [DESIGN-002](TDD.md#design-002) | [TEST-COMP-OFF-ADMINISTRATION-002](#test-comp-off-administration-002) |
| [REQ-COMP-OFF-ADMINISTRATION-003](FDD.md#req-comp-off-administration-003) | [DESIGN-003](TDD.md#design-003) | [TEST-COMP-OFF-ADMINISTRATION-003](#test-comp-off-administration-003) |
| [REQ-COMP-OFF-ADMINISTRATION-004](FDD.md#req-comp-off-administration-004) | [DESIGN-004](TDD.md#design-004) | [TEST-COMP-OFF-ADMINISTRATION-004](#test-comp-off-administration-004) |
| [REQ-COMP-OFF-ADMINISTRATION-005](FDD.md#req-comp-off-administration-005) | [DESIGN-005](TDD.md#design-005) | [TEST-COMP-OFF-ADMINISTRATION-005](#test-comp-off-administration-005) |
| [REQ-COMP-OFF-ADMINISTRATION-006](FDD.md#req-comp-off-administration-006) | [DESIGN-006](TDD.md#design-006) | [TEST-COMP-OFF-ADMINISTRATION-006](#test-comp-off-administration-006) |

## TEST-COMP-OFF-ADMINISTRATION-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-COMP-OFF-ADMINISTRATION-001](FDD.md#req-comp-off-administration-001) through the declared API and relevant native UI.
Assert: Same evidence is credited once; mismatched tenant/version/digest rejects; no Timesheet adapter is invented.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-COMP-OFF-ADMINISTRATION-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-COMP-OFF-ADMINISTRATION-002](FDD.md#req-comp-off-administration-002) through the declared API and relevant native UI.
Assert: Without a published rule no credit is created; maker cannot approve manual credit and conversion retains its input evidence.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-COMP-OFF-ADMINISTRATION-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-COMP-OFF-ADMINISTRATION-003](FDD.md#req-comp-off-administration-003) through the declared API and relevant native UI.
Assert: Already-used invalidated credit opens a restricted exception; it never deletes history or silently manufactures replacement units.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-COMP-OFF-ADMINISTRATION-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-COMP-OFF-ADMINISTRATION-004](FDD.md#req-comp-off-administration-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-COMP-OFF-ADMINISTRATION-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-COMP-OFF-ADMINISTRATION-005](FDD.md#req-comp-off-administration-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-COMP-OFF-ADMINISTRATION-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-COMP-OFF-ADMINISTRATION-006](FDD.md#req-comp-off-administration-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
