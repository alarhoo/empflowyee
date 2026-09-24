# Notification Templates — requirement traceability

Status: design coverage complete; all test entries below are **planned, not executed**.

## MATRIX

| Requirement                                                             | Design                      | Planned test                    |
| ----------------------------------------------------------------------- | --------------------------- | ------------------------------- |
| [REQ-NOTIFICATION-TEMPLATES-001](FDD.md#req-notification-templates-001) | [TDD#READ](TDD.md#read)     | TEST-NOTIFICATION-TEMPLATES-001 |
| [REQ-NOTIFICATION-TEMPLATES-002](FDD.md#req-notification-templates-002) | [TDD#ACTION](TDD.md#action) | TEST-NOTIFICATION-TEMPLATES-002 |
| [REQ-NOTIFICATION-TEMPLATES-003](FDD.md#req-notification-templates-003) | [TDD#RULES](TDD.md#rules)   | TEST-NOTIFICATION-TEMPLATES-003 |
| [REQ-NOTIFICATION-TEMPLATES-004](FDD.md#req-notification-templates-004) | [TDD#AUTH](TDD.md#auth)     | TEST-NOTIFICATION-TEMPLATES-004 |
| [REQ-NOTIFICATION-TEMPLATES-005](FDD.md#req-notification-templates-005) | [TDD#UX](TDD.md#ux)         | TEST-NOTIFICATION-TEMPLATES-005 |
| [REQ-NOTIFICATION-TEMPLATES-006](FDD.md#req-notification-templates-006) | [TDD#DATA](TDD.md#data)     | TEST-NOTIFICATION-TEMPLATES-006 |

## TEST-NOTIFICATION-TEMPLATES-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: No email/HTML template or fake notification appears.

Assert: List one actual configured template per registered event with safe defaults from seed tooling.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-NOTIFICATION-TEMPLATES-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Reject unknown placeholders, URL-like external links, tags and control characters; preview never sends.

Assert: Edit bounded title/body using requestId/dueDate placeholders; preview text only and save with reason/revision.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-NOTIFICATION-TEMPLATES-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Deliver then edit and verify immutable prior inbox content plus audit field-name summary.

Assert: Template edits affect later deliveries, leaving existing inbox bodies unchanged.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-NOTIFICATION-TEMPLATES-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.notifications and subject scope. Browser visibility never authorizes an action.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-NOTIFICATION-TEMPLATES-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-NOTIFICATION-TEMPLATES-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.
