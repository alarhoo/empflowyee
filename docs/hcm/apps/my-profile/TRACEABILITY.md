# My Profile — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                     | Design                      | Planned test        |
| ----------------------------------------------- | --------------------------- | ------------------- |
| [REQ-MY-PROFILE-001](FDD.md#req-my-profile-001) | [TDD#READ](TDD.md#read)     | TEST-MY-PROFILE-001 |
| [REQ-MY-PROFILE-002](FDD.md#req-my-profile-002) | [TDD#ACTION](TDD.md#action) | TEST-MY-PROFILE-002 |
| [REQ-MY-PROFILE-003](FDD.md#req-my-profile-003) | [TDD#UX](TDD.md#ux)         | TEST-MY-PROFILE-003 |
| [REQ-MY-PROFILE-004](FDD.md#req-my-profile-004) | [TDD#RULES](TDD.md#rules)   | TEST-MY-PROFILE-004 |
| [REQ-MY-PROFILE-005](FDD.md#req-my-profile-005) | [TDD#READ](TDD.md#read)     | TEST-MY-PROFILE-005 |
| [REQ-MY-PROFILE-006](FDD.md#req-my-profile-006) | [TDD#AUTH](TDD.md#auth)     | TEST-MY-PROFILE-006 |
| [REQ-MY-PROFILE-007](FDD.md#req-my-profile-007) | [TDD#UX](TDD.md#ux)         | TEST-MY-PROFILE-007 |
| [REQ-MY-PROFILE-008](FDD.md#req-my-profile-008) | [TDD#DATA](TDD.md#data)     | TEST-MY-PROFILE-008 |

## TEST-MY-PROFILE-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: The DTO equals the Self allowlist; an account without a linked worker sees an explanatory empty state, not an error.

Assert: Show every field whose effective visibility includes Self, grouped by section, with each field’s edit mode. Concurrent employments are shown separately.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-MY-PROFILE-002

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Emergency priority is unique per person; dependants are allowed only for relationship types eligible as dependants; fields in other modes reject edits with `field-not-editable`.

Assert: Edit preferred name, blood group, personal email and mobile (saved as not verified), emergency contacts and dependants, and Direct custom fields.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-MY-PROFILE-003

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Before My HR Requests ships, no correction control appears and no request is fabricated.

Assert: ServiceRequest fields (legal names, birth date, gender, marital status, nationality, addresses) show Request correction, which opens a prefilled HR request. The action appears only when My HR Requests is implemented and discoverable.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-MY-PROFILE-004

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A narrowed work email disappears from the directory for other viewers on the next request.

Assert: Where a field allows worker preferences, narrow its organisation visibility, or use an allowed opt-in. Preferences never widen beyond tenant policy.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-MY-PROFILE-005

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: No edit control exists for these fields; they reflect the latest committed workforce facts.

Assert: Show legal entity, unit, department, designation, location, manager, employment type, status, service dates and probation facts read-only.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-MY-PROFILE-006

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-MY-PROFILE-007

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-MY-PROFILE-008

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

Assert: Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
