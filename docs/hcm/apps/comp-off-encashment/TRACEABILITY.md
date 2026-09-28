# Comp Off Encashment — requirement traceability

Status: reviewed design/test plan, 2026-09-28. No business tests have run because
implementation has not begun. Each scenario below is an implementation acceptance
obligation linked to the approved FDD and concrete technical design.

| Requirement                                                       | Design                          | Planned test                                                  |
| ----------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------- |
| [REQ-COMP-OFF-ENCASHMENT-001](FDD.md#req-comp-off-encashment-001) | [DESIGN-001](TDD.md#design-001) | [TEST-COMP-OFF-ENCASHMENT-001](#test-comp-off-encashment-001) |
| [REQ-COMP-OFF-ENCASHMENT-002](FDD.md#req-comp-off-encashment-002) | [DESIGN-002](TDD.md#design-002) | [TEST-COMP-OFF-ENCASHMENT-002](#test-comp-off-encashment-002) |
| [REQ-COMP-OFF-ENCASHMENT-003](FDD.md#req-comp-off-encashment-003) | [DESIGN-003](TDD.md#design-003) | [TEST-COMP-OFF-ENCASHMENT-003](#test-comp-off-encashment-003) |
| [REQ-COMP-OFF-ENCASHMENT-004](FDD.md#req-comp-off-encashment-004) | [DESIGN-004](TDD.md#design-004) | [TEST-COMP-OFF-ENCASHMENT-004](#test-comp-off-encashment-004) |
| [REQ-COMP-OFF-ENCASHMENT-005](FDD.md#req-comp-off-encashment-005) | [DESIGN-005](TDD.md#design-005) | [TEST-COMP-OFF-ENCASHMENT-005](#test-comp-off-encashment-005) |
| [REQ-COMP-OFF-ENCASHMENT-006](FDD.md#req-comp-off-encashment-006) | [DESIGN-006](TDD.md#design-006) | [TEST-COMP-OFF-ENCASHMENT-006](#test-comp-off-encashment-006) |

## TEST-COMP-OFF-ENCASHMENT-001

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-COMP-OFF-ENCASHMENT-001](FDD.md#req-comp-off-encashment-001) through the declared API and relevant native UI.
Assert: No policy means explicitly unavailable capability; employees cannot enter invented worked minutes.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-COMP-OFF-ENCASHMENT-002

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-COMP-OFF-ENCASHMENT-002](FDD.md#req-comp-off-encashment-002) through the declared API and relevant native UI.
Assert: Late/duplicate claims fail; partial consumption and expiry preserve remaining proven units and source evidence.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-COMP-OFF-ENCASHMENT-003

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-COMP-OFF-ENCASHMENT-003](FDD.md#req-comp-off-encashment-003) through the declared API and relevant native UI.
Assert: No monetary estimate, Paid simulation or submission to a missing consumer; DEC-HCM3-019 fixes the current scope to units-only contract/configuration with disabled submission/handoff.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-COMP-OFF-ENCASHMENT-004

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-COMP-OFF-ENCASHMENT-004](FDD.md#req-comp-off-encashment-004) through the declared API and relevant native UI.
Assert: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.

## TEST-COMP-OFF-ENCASHMENT-005

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-COMP-OFF-ENCASHMENT-005](FDD.md#req-comp-off-encashment-005) through the declared API and relevant native UI.
Assert: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: browser accessibility/interaction plus HTTP projection.

## TEST-COMP-OFF-ENCASHMENT-006

Given two seeded tenants, authorized and unauthorized actors, current and stale
versions, and the requirement-specific domain inputs, execute
[REQ-COMP-OFF-ENCASHMENT-006](FDD.md#req-comp-off-encashment-006) through the declared API and relevant native UI.
Assert: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.
Assert no foreign rows/counts/private fields or partial business effects. For a
mutation retry the same key and verify one result/audit/effect; for a read verify
no mutation. Inspect SQL receipts/outbox where the requirement creates work.
Planned suite: PostgreSQL/API integration plus domain boundary cases.
