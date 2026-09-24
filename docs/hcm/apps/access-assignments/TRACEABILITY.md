# Access Assignments — requirement traceability

Status: design coverage complete; all test entries below are **planned, not executed**.

## MATRIX

| Requirement                                                     | Design                      | Planned test                |
| --------------------------------------------------------------- | --------------------------- | --------------------------- |
| [REQ-ACCESS-ASSIGNMENTS-001](FDD.md#req-access-assignments-001) | [TDD#READ](TDD.md#read)     | TEST-ACCESS-ASSIGNMENTS-001 |
| [REQ-ACCESS-ASSIGNMENTS-002](FDD.md#req-access-assignments-002) | [TDD#ACTION](TDD.md#action) | TEST-ACCESS-ASSIGNMENTS-002 |
| [REQ-ACCESS-ASSIGNMENTS-003](FDD.md#req-access-assignments-003) | [TDD#RULES](TDD.md#rules)   | TEST-ACCESS-ASSIGNMENTS-003 |
| [REQ-ACCESS-ASSIGNMENTS-004](FDD.md#req-access-assignments-004) | [TDD#AUTH](TDD.md#auth)     | TEST-ACCESS-ASSIGNMENTS-004 |
| [REQ-ACCESS-ASSIGNMENTS-005](FDD.md#req-access-assignments-005) | [TDD#UX](TDD.md#ux)         | TEST-ACCESS-ASSIGNMENTS-005 |
| [REQ-ACCESS-ASSIGNMENTS-006](FDD.md#req-access-assignments-006) | [TDD#DATA](TDD.md#data)     | TEST-ACCESS-ASSIGNMENTS-006 |

## TEST-ACCESS-ASSIGNMENTS-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Accounts without roles render an empty role collection, not an invented employee grant.

Assert: Read tenant accounts and their current roles from the database; disabled accounts remain visible to administrators.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-ACCESS-ASSIGNMENTS-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Grant/revoke persists after reload; duplicate grant is conflict unless identical receipt replay.

Assert: Select an existing account and role, confirm the exact target and reason; update only that assignment and advance account revision.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-ACCESS-ASSIGNMENTS-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Race two final-admin revokes and an account disable; invariant holds and prior-context browser caches clear.

Assert: Reject removal of the final enabled protected administrator; role changes affect the next verified request.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-ACCESS-ASSIGNMENTS-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.access-control and subject scope. Browser visibility never authorizes an action.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-ACCESS-ASSIGNMENTS-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-ACCESS-ASSIGNMENTS-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.
