# Tenant Access Reviews — requirement traceability

Status: design coverage complete; all test entries below are **planned, not executed**.

## MATRIX

| Requirement                                                           | Design                      | Planned test                   |
| --------------------------------------------------------------------- | --------------------------- | ------------------------------ |
| [REQ-TENANT-ACCESS-REVIEWS-001](FDD.md#req-tenant-access-reviews-001) | [TDD#READ](TDD.md#read)     | TEST-TENANT-ACCESS-REVIEWS-001 |
| [REQ-TENANT-ACCESS-REVIEWS-002](FDD.md#req-tenant-access-reviews-002) | [TDD#ACTION](TDD.md#action) | TEST-TENANT-ACCESS-REVIEWS-002 |
| [REQ-TENANT-ACCESS-REVIEWS-003](FDD.md#req-tenant-access-reviews-003) | [TDD#RULES](TDD.md#rules)   | TEST-TENANT-ACCESS-REVIEWS-003 |
| [REQ-TENANT-ACCESS-REVIEWS-004](FDD.md#req-tenant-access-reviews-004) | [TDD#AUTH](TDD.md#auth)     | TEST-TENANT-ACCESS-REVIEWS-004 |
| [REQ-TENANT-ACCESS-REVIEWS-005](FDD.md#req-tenant-access-reviews-005) | [TDD#UX](TDD.md#ux)         | TEST-TENANT-ACCESS-REVIEWS-005 |
| [REQ-TENANT-ACCESS-REVIEWS-006](FDD.md#req-tenant-access-reviews-006) | [TDD#DATA](TDD.md#data)     | TEST-TENANT-ACCESS-REVIEWS-006 |

## TEST-TENANT-ACCESS-REVIEWS-001

Type: api-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Concurrent grant writes cannot create a mixed snapshot; empty snapshot can be closed.

Assert: Start a review with label/reason and snapshot current assignment occurrences and account/role revisions.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-TENANT-ACCESS-REVIEWS-002

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Revoke/regrant same pair is detected through grantId; last-admin revoke fails without marking item decided.

Assert: Retain/revoke a pending item with reason; stale snapshots require explicit refresh. Revoke uses protected grant rules.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-TENANT-ACCESS-REVIEWS-003

Type: domain-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Retained grant changes prevent closure until refreshed/re-decided; Closed review is read-only.

Assert: Close only after every item is decided and retained evidence still matches; clearly show snapshot time and out-of-scope later grants.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-TENANT-ACCESS-REVIEWS-004

Type: security-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Test direct requests with missing grant/entitlement, disabled actor, foreign tenant and another same-tenant subject; inspect mode grants nothing.

Assert: Every API enforces verified tenant, enabled actor, listed business permission, entitlement hcm.access-control and subject scope. Browser visibility never authorizes an action.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-TENANT-ACCESS-REVIEWS-005

Type: browser-accessibility.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Exercise keyboard, responsive widths, all four themes, tenant-overlay removal, retry and late responses after persona switch.

Assert: Use real API data with loading, empty, error/retry, unavailable/denied and read-only states. Preserve failed drafts and focus; no silent fallback to fixtures.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.

## TEST-TENANT-ACCESS-REVIEWS-006

Type: postgresql-integration.

Setup: real domain fixtures in isolated tests or versioned Dunder Mifflin database seeds; tenant A/B, permitted actor and denied actor.

Exercise: Verify PostgreSQL/RLS constraints, failure recovery, real local API reload and the domain-specific acceptance cases without fake frontend data.

Assert: Commands persist their documented state, revision, audit and receipt under the shared transaction/storage contract; no success before commit.

Evidence: implementation test path/run, database/API result and browser evidence where applicable must be attached in the future validation record; no execution claim here.
