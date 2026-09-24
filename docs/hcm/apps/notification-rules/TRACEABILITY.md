# Notification Rules — requirement traceability

Status: design coverage complete; all test entries below are **planned, not executed**.

## MATRIX

| Requirement                                                     | Design                      | Planned test                |
| --------------------------------------------------------------- | --------------------------- | --------------------------- |
| [REQ-NOTIFICATION-RULES-001](FDD.md#req-notification-rules-001) | [TDD#READ](TDD.md#read)     | TEST-NOTIFICATION-RULES-001 |
| [REQ-NOTIFICATION-RULES-002](FDD.md#req-notification-rules-002) | [TDD#ACTION](TDD.md#action) | TEST-NOTIFICATION-RULES-002 |
| [REQ-NOTIFICATION-RULES-003](FDD.md#req-notification-rules-003) | [TDD#RULES](TDD.md#rules)   | TEST-NOTIFICATION-RULES-003 |
| [REQ-NOTIFICATION-RULES-004](FDD.md#req-notification-rules-004) | [TDD#AUTH](TDD.md#auth)     | TEST-NOTIFICATION-RULES-004 |
| [REQ-NOTIFICATION-RULES-005](FDD.md#req-notification-rules-005) | [TDD#UX](TDD.md#ux)         | TEST-NOTIFICATION-RULES-005 |
| [REQ-NOTIFICATION-RULES-006](FDD.md#req-notification-rules-006) | [TDD#DATA](TDD.md#data)     | TEST-NOTIFICATION-RULES-006 |

## TEST-NOTIFICATION-RULES-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Document submitted targets requesting HR account; requested/replacement target linked enabled worker accounts.

Assert: Show the supported event and its documented recipient resolution; no editable target list.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-NOTIFICATION-RULES-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Concurrent toggle conflict and unauthorized edits preserve existing rule.

Assert: Enable/disable with reason/revision; no external destination, custom condition or new rule type.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-NOTIFICATION-RULES-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Preference true does not override disabled rule; prior inbox data remains unchanged.

Assert: A disabled tenant rule suppresses all matching future events; an enabled rule still checks recipient preference.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-NOTIFICATION-RULES-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.notifications and subject scope. Browser visibility never authorizes an action.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-NOTIFICATION-RULES-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-NOTIFICATION-RULES-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.
