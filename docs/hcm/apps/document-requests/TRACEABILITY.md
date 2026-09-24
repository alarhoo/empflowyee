# Document Requests — requirement traceability

Status: design coverage complete; all test entries below are **planned, not executed**.

## MATRIX

| Requirement                                                   | Design                      | Planned test               |
| ------------------------------------------------------------- | --------------------------- | -------------------------- |
| [REQ-DOCUMENT-REQUESTS-001](FDD.md#req-document-requests-001) | [TDD#READ](TDD.md#read)     | TEST-DOCUMENT-REQUESTS-001 |
| [REQ-DOCUMENT-REQUESTS-002](FDD.md#req-document-requests-002) | [TDD#ACTION](TDD.md#action) | TEST-DOCUMENT-REQUESTS-002 |
| [REQ-DOCUMENT-REQUESTS-003](FDD.md#req-document-requests-003) | [TDD#RULES](TDD.md#rules)   | TEST-DOCUMENT-REQUESTS-003 |
| [REQ-DOCUMENT-REQUESTS-004](FDD.md#req-document-requests-004) | [TDD#AUTH](TDD.md#auth)     | TEST-DOCUMENT-REQUESTS-004 |
| [REQ-DOCUMENT-REQUESTS-005](FDD.md#req-document-requests-005) | [TDD#UX](TDD.md#ux)         | TEST-DOCUMENT-REQUESTS-005 |
| [REQ-DOCUMENT-REQUESTS-006](FDD.md#req-document-requests-006) | [TDD#DATA](TDD.md#data)     | TEST-DOCUMENT-REQUESTS-006 |

## TEST-DOCUMENT-REQUESTS-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Worker without account still has persisted request and Undeliverable intent, never invented email delivery.

Assert: HR selects existing worker/type and optional due date; creates Open request and in-app requested event.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-REQUESTS-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Open->Submitted->Completed and Submitted->Open paths persist exactly one event/version per receipt; foreign submitter denied.

Assert: Addressed employee submits validated file only while Open; HR accepts Submitted or requests replacement with reason.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-REQUESTS-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Race cancel/submit or accept/replacement under revision; terminal writes fail with no partial file/business success.

Assert: HR cancels Open/Submitted with reason; terminal states cannot be reopened. Previous submissions remain visible to their subject/HR.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-REQUESTS-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.documents and subject scope. Browser visibility never authorizes an action.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-REQUESTS-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-DOCUMENT-REQUESTS-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.
