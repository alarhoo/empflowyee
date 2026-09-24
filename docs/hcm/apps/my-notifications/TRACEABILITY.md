# My Notifications — requirement traceability

Status: design coverage complete; all test entries below are **planned, not executed**.

## MATRIX

| Requirement                                                 | Design                      | Planned test              |
| ----------------------------------------------------------- | --------------------------- | ------------------------- |
| [REQ-MY-NOTIFICATIONS-001](FDD.md#req-my-notifications-001) | [TDD#READ](TDD.md#read)     | TEST-MY-NOTIFICATIONS-001 |
| [REQ-MY-NOTIFICATIONS-002](FDD.md#req-my-notifications-002) | [TDD#ACTION](TDD.md#action) | TEST-MY-NOTIFICATIONS-002 |
| [REQ-MY-NOTIFICATIONS-003](FDD.md#req-my-notifications-003) | [TDD#RULES](TDD.md#rules)   | TEST-MY-NOTIFICATIONS-003 |
| [REQ-MY-NOTIFICATIONS-004](FDD.md#req-my-notifications-004) | [TDD#AUTH](TDD.md#auth)     | TEST-MY-NOTIFICATIONS-004 |
| [REQ-MY-NOTIFICATIONS-005](FDD.md#req-my-notifications-005) | [TDD#UX](TDD.md#ux)         | TEST-MY-NOTIFICATIONS-005 |
| [REQ-MY-NOTIFICATIONS-006](FDD.md#req-my-notifications-006) | [TDD#DATA](TDD.md#data)     | TEST-MY-NOTIFICATIONS-006 |

## TEST-MY-NOTIFICATIONS-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Other account/tenant IDs and hidden recipient fields cannot enumerate another inbox.

Assert: Only persisted notifications addressed to the verified account appear.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-NOTIFICATIONS-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Reload and stale/repeated requests prove correct revision and timestamp behavior.

Assert: Mark an individual item read without deleting it; receipt retry preserves first read timestamp.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-NOTIFICATIONS-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: An inbox before producer/route implementation is honestly empty or informational, never a fake business destination.

Assert: Document-request action is enabled only when its implemented route is discoverable; destination re-authorizes subject.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-NOTIFICATIONS-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.notifications and subject scope. Browser visibility never authorizes an action.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-NOTIFICATIONS-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-NOTIFICATIONS-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.
