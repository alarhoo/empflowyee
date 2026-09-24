# Document Templates — requirement traceability

Status: design coverage complete; all test entries below are **planned, not executed**.

## MATRIX

| Requirement                                                     | Design                      | Planned test                |
| --------------------------------------------------------------- | --------------------------- | --------------------------- |
| [REQ-DOCUMENT-TEMPLATES-001](FDD.md#req-document-templates-001) | [TDD#READ](TDD.md#read)     | TEST-DOCUMENT-TEMPLATES-001 |
| [REQ-DOCUMENT-TEMPLATES-002](FDD.md#req-document-templates-002) | [TDD#ACTION](TDD.md#action) | TEST-DOCUMENT-TEMPLATES-002 |
| [REQ-DOCUMENT-TEMPLATES-003](FDD.md#req-document-templates-003) | [TDD#RULES](TDD.md#rules)   | TEST-DOCUMENT-TEMPLATES-003 |
| [REQ-DOCUMENT-TEMPLATES-004](FDD.md#req-document-templates-004) | [TDD#AUTH](TDD.md#auth)     | TEST-DOCUMENT-TEMPLATES-004 |
| [REQ-DOCUMENT-TEMPLATES-005](FDD.md#req-document-templates-005) | [TDD#UX](TDD.md#ux)         | TEST-DOCUMENT-TEMPLATES-005 |
| [REQ-DOCUMENT-TEMPLATES-006](FDD.md#req-document-templates-006) | [TDD#DATA](TDD.md#data)     | TEST-DOCUMENT-TEMPLATES-006 |

## TEST-DOCUMENT-TEMPLATES-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Jim and David without HR grants are denied, including guessed download IDs.

Assert: HR lists templates and immutable versions; employee self-service has no template access.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-TEMPLATES-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Crash/retry yields one Ready version only; reject disabled type for new template.

Assert: Create or version with validated PDF/PNG/JPEG <=10 MiB through the staged upload protocol.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-TEMPLATES-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify headers, persistent bytes/hash, denied foreign version and missing-file 503.

Assert: Stream an authorized immutable attachment with access audit, not mail merge/e-signature/public URL.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-TEMPLATES-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.documents and subject scope. Browser visibility never authorizes an action.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-TEMPLATES-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-TEMPLATES-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.
