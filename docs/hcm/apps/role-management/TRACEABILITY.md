# Role Management — requirement traceability

Status: design coverage complete; all test entries below are **planned, not executed**.

## MATRIX

| Requirement                                               | Design                      | Planned test             |
| --------------------------------------------------------- | --------------------------- | ------------------------ |
| [REQ-ROLE-MANAGEMENT-001](FDD.md#req-role-management-001) | [TDD#READ](TDD.md#read)     | TEST-ROLE-MANAGEMENT-001 |
| [REQ-ROLE-MANAGEMENT-002](FDD.md#req-role-management-002) | [TDD#ACTION](TDD.md#action) | TEST-ROLE-MANAGEMENT-002 |
| [REQ-ROLE-MANAGEMENT-003](FDD.md#req-role-management-003) | [TDD#RULES](TDD.md#rules)   | TEST-ROLE-MANAGEMENT-003 |
| [REQ-ROLE-MANAGEMENT-004](FDD.md#req-role-management-004) | [TDD#AUTH](TDD.md#auth)     | TEST-ROLE-MANAGEMENT-004 |
| [REQ-ROLE-MANAGEMENT-005](FDD.md#req-role-management-005) | [TDD#UX](TDD.md#ux)         | TEST-ROLE-MANAGEMENT-005 |
| [REQ-ROLE-MANAGEMENT-006](FDD.md#req-role-management-006) | [TDD#DATA](TDD.md#data)     | TEST-ROLE-MANAGEMENT-006 |

## TEST-ROLE-MANAGEMENT-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: David lists roles; Jim is denied even if the tile is exposed by inspection.

Assert: Opening shows persisted seeded roles and registered discovery/business permissions without treating discovery as authorization.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-ROLE-MANAGEMENT-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Create, reload and edit a custom role; reject duplicate label, unknown permission and stale revision.

Assert: Create/edit a non-system role with a trimmed unique label and registered permission codes; saving with a reason returns the new revision.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-ROLE-MANAGEMENT-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Attempt protected edits, flag injection and deletion of an assigned role; no row or audit success is committed.

Assert: System roles cannot be edited/deleted; an assigned custom role cannot be deleted.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-ROLE-MANAGEMENT-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.access-control and subject scope. Browser visibility never authorizes an action.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-ROLE-MANAGEMENT-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-ROLE-MANAGEMENT-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.
