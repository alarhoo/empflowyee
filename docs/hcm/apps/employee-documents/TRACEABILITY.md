# Employee Documents — requirement traceability

Status: design coverage complete; all test entries below are **planned, not executed**.

## MATRIX

| Requirement                                                     | Design                      | Planned test                |
| --------------------------------------------------------------- | --------------------------- | --------------------------- |
| [REQ-EMPLOYEE-DOCUMENTS-001](FDD.md#req-employee-documents-001) | [TDD#READ](TDD.md#read)     | TEST-EMPLOYEE-DOCUMENTS-001 |
| [REQ-EMPLOYEE-DOCUMENTS-002](FDD.md#req-employee-documents-002) | [TDD#ACTION](TDD.md#action) | TEST-EMPLOYEE-DOCUMENTS-002 |
| [REQ-EMPLOYEE-DOCUMENTS-003](FDD.md#req-employee-documents-003) | [TDD#RULES](TDD.md#rules)   | TEST-EMPLOYEE-DOCUMENTS-003 |
| [REQ-EMPLOYEE-DOCUMENTS-004](FDD.md#req-employee-documents-004) | [TDD#AUTH](TDD.md#auth)     | TEST-EMPLOYEE-DOCUMENTS-004 |
| [REQ-EMPLOYEE-DOCUMENTS-005](FDD.md#req-employee-documents-005) | [TDD#UX](TDD.md#ux)         | TEST-EMPLOYEE-DOCUMENTS-005 |
| [REQ-EMPLOYEE-DOCUMENTS-006](FDD.md#req-employee-documents-006) | [TDD#DATA](TDD.md#data)     | TEST-EMPLOYEE-DOCUMENTS-006 |

## TEST-EMPLOYEE-DOCUMENTS-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: HR can select tenant workers without creating login/persona or requiring employment lifecycle.

Assert: Pick/search a real tenant worker; show metadata even when worker has no account.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-EMPLOYEE-DOCUMENTS-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: New version does not implicitly expose old hidden versions; stale sharing edit conflicts.

Assert: Upload a new document/version with visibility default false; change sharing for one version with reason/revision.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-EMPLOYEE-DOCUMENTS-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: David without HR, Michael team guesses and cross-tenant IDs fail; every successful attachment authorization is audited.

Assert: Only explicit HR permissions grant worker-wide read/download; account admin alone is insufficient.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-EMPLOYEE-DOCUMENTS-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.documents and subject scope. Browser visibility never authorizes an action.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-EMPLOYEE-DOCUMENTS-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-EMPLOYEE-DOCUMENTS-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.
