# Document Types — requirement traceability

Status: design coverage complete; all test entries below are **planned, not executed**.

## MATRIX

| Requirement                                             | Design                      | Planned test            |
| ------------------------------------------------------- | --------------------------- | ----------------------- |
| [REQ-DOCUMENT-TYPES-001](FDD.md#req-document-types-001) | [TDD#READ](TDD.md#read)     | TEST-DOCUMENT-TYPES-001 |
| [REQ-DOCUMENT-TYPES-002](FDD.md#req-document-types-002) | [TDD#ACTION](TDD.md#action) | TEST-DOCUMENT-TYPES-002 |
| [REQ-DOCUMENT-TYPES-003](FDD.md#req-document-types-003) | [TDD#RULES](TDD.md#rules)   | TEST-DOCUMENT-TYPES-003 |
| [REQ-DOCUMENT-TYPES-004](FDD.md#req-document-types-004) | [TDD#AUTH](TDD.md#auth)     | TEST-DOCUMENT-TYPES-004 |
| [REQ-DOCUMENT-TYPES-005](FDD.md#req-document-types-005) | [TDD#UX](TDD.md#ux)         | TEST-DOCUMENT-TYPES-005 |
| [REQ-DOCUMENT-TYPES-006](FDD.md#req-document-types-006) | [TDD#DATA](TDD.md#data)     | TEST-DOCUMENT-TYPES-006 |

## TEST-DOCUMENT-TYPES-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Other tenants and ungranted David cannot inspect content-administration lists.

Assert: List persisted tenant document types including disabled values for HR.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-TYPES-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Reject code edits, duplicate code, invalid characters and unauthorized writes.

Assert: Create unique code and label; edit label/description/enabled only with revision and reason.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-TYPES-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Existing open request can still be fulfilled; no destructive delete endpoint or inferred retention rule.

Assert: Disabled types prevent new documents/templates/requests while existing requests and downloads remain usable.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-TYPES-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.documents and subject scope. Browser visibility never authorizes an action.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-TYPES-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-TYPES-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.
