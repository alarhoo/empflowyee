# My HR Requests — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                             | Design                      | Planned test            |
| ------------------------------------------------------- | --------------------------- | ----------------------- |
| [REQ-MY-HR-REQUESTS-001](FDD.md#req-my-hr-requests-001) | [TDD#ACTION](TDD.md#action) | TEST-MY-HR-REQUESTS-001 |
| [REQ-MY-HR-REQUESTS-002](FDD.md#req-my-hr-requests-002) | [TDD#RULES](TDD.md#rules)   | TEST-MY-HR-REQUESTS-002 |
| [REQ-MY-HR-REQUESTS-003](FDD.md#req-my-hr-requests-003) | [TDD#ACTION](TDD.md#action) | TEST-MY-HR-REQUESTS-003 |
| [REQ-MY-HR-REQUESTS-004](FDD.md#req-my-hr-requests-004) | [TDD#UX](TDD.md#ux)         | TEST-MY-HR-REQUESTS-004 |
| [REQ-MY-HR-REQUESTS-005](FDD.md#req-my-hr-requests-005) | [TDD#AUTH](TDD.md#auth)     | TEST-MY-HR-REQUESTS-005 |
| [REQ-MY-HR-REQUESTS-006](FDD.md#req-my-hr-requests-006) | [TDD#UX](TDD.md#ux)         | TEST-MY-HR-REQUESTS-006 |
| [REQ-MY-HR-REQUESTS-007](FDD.md#req-my-hr-requests-007) | [TDD#DATA](TDD.md#data)     | TEST-MY-HR-REQUESTS-007 |

## TEST-MY-HR-REQUESTS-001

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Types outside the actor’s audience or entitlement are not offered and are rejected server-side; the request number is returned.

Assert: Choose a request type available to the actor’s audience, enter subject and description, and optionally attach one file. The description becomes the first message.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-MY-HR-REQUESTS-002

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Internal notes, internal attachments, assignee identity and internal SLA fields never appear.

Assert: Read employee-visible messages and attachments and reply while the request is not Closed or Cancelled.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-MY-HR-REQUESTS-003

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Reopen on day 8 returns 409; Closed and Cancelled requests are read-only.

Assert: Cancel a New or Open request with a reason. Reopen a Resolved request within 7 days of resolution (DEC-HCM2-004).

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-MY-HR-REQUESTS-004

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: The prefill never submits automatically and never includes the current personal value.

Assert: A link from My Profile opens the create dialog with the personal-data correction type and the field name prefilled; the actor still reviews and submits.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-MY-HR-REQUESTS-005

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-MY-HR-REQUESTS-006

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-MY-HR-REQUESTS-007

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

Assert: Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
