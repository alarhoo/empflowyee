# My Activity — requirement traceability

Status: design coverage complete; all test entries below are **planned, not executed**.

## MATRIX

| Requirement                                       | Design                      | Planned test         |
| ------------------------------------------------- | --------------------------- | -------------------- |
| [REQ-MY-ACTIVITY-001](FDD.md#req-my-activity-001) | [TDD#READ](TDD.md#read)     | TEST-MY-ACTIVITY-001 |
| [REQ-MY-ACTIVITY-002](FDD.md#req-my-activity-002) | [TDD#ACTION](TDD.md#action) | TEST-MY-ACTIVITY-002 |
| [REQ-MY-ACTIVITY-003](FDD.md#req-my-activity-003) | [TDD#RULES](TDD.md#rules)   | TEST-MY-ACTIVITY-003 |
| [REQ-MY-ACTIVITY-004](FDD.md#req-my-activity-004) | [TDD#AUTH](TDD.md#auth)     | TEST-MY-ACTIVITY-004 |
| [REQ-MY-ACTIVITY-005](FDD.md#req-my-activity-005) | [TDD#UX](TDD.md#ux)         | TEST-MY-ACTIVITY-005 |
| [REQ-MY-ACTIVITY-006](FDD.md#req-my-activity-006) | [TDD#DATA](TDD.md#data)     | TEST-MY-ACTIVITY-006 |

## TEST-MY-ACTIVITY-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify tenant scope and own-actor restriction.

Assert: Read only the current account's activity. Rows come from the append-only store with safe DTO projection.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-ACTIVITY-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test date boundaries, equal timestamps, malformed cursors and forbidden summary keys.

Assert: Filter and paginate using stable event ordering; no raw payload, document body or credential fields.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-ACTIVITY-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: No seeded fictional history appears as actual activity; no edit/delete/export action exists.

Assert: No recorded actions shows an honest empty state; a DB failure shows an error.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-ACTIVITY-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.audit and subject scope. Browser visibility never authorizes an action.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-ACTIVITY-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-MY-ACTIVITY-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Read models preserve source ownership and never write configuration or invent historical rows. Downloads, where offered, create actual sensitive-read evidence.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.
