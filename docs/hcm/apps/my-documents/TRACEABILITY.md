# My Documents — requirement traceability

Status: design coverage complete; all test entries below are **planned, not executed**.

## MATRIX

| Requirement                                         | Design                      | Planned test          |
| --------------------------------------------------- | --------------------------- | --------------------- |
| [REQ-MY-DOCUMENTS-001](FDD.md#req-my-documents-001) | [TDD#READ](TDD.md#read)     | TEST-MY-DOCUMENTS-001 |
| [REQ-MY-DOCUMENTS-002](FDD.md#req-my-documents-002) | [TDD#ACTION](TDD.md#action) | TEST-MY-DOCUMENTS-002 |
| [REQ-MY-DOCUMENTS-003](FDD.md#req-my-documents-003) | [TDD#RULES](TDD.md#rules)   | TEST-MY-DOCUMENTS-003 |
| [REQ-MY-DOCUMENTS-004](FDD.md#req-my-documents-004) | [TDD#AUTH](TDD.md#auth)     | TEST-MY-DOCUMENTS-004 |
| [REQ-MY-DOCUMENTS-005](FDD.md#req-my-documents-005) | [TDD#UX](TDD.md#ux)         | TEST-MY-DOCUMENTS-005 |
| [REQ-MY-DOCUMENTS-006](FDD.md#req-my-documents-006) | [TDD#DATA](TDD.md#data)     | TEST-MY-DOCUMENTS-006 |

## TEST-MY-DOCUMENTS-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Account with no worker link gets honest empty; another account/person cannot be selected.

Assert: Show only Ready employee-visible versions linked to the verified person, and no hidden-version counts.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-DOCUMENTS-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Revoke sharing after list then download: 404; no stale list authorization bypass.

Assert: Authorize again on every download; stream attachment only after sensitive-read audit.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-DOCUMENTS-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: No filename/metadata leak for hidden versions and no implied manager access.

Assert: No HR-only templates, unrestricted upload, delete or team documents. Own request submissions stay in Document Requests.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-DOCUMENTS-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.documents and subject scope. Browser visibility never authorizes an action.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-DOCUMENTS-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-DOCUMENTS-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Read models preserve source ownership and never write configuration or invent historical rows. Downloads, where offered, create actual sensitive-read evidence.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.
