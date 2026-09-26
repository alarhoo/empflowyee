# Position Requirements — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                                           | Design                      | Planned test                   |
| --------------------------------------------------------------------- | --------------------------- | ------------------------------ |
| [REQ-POSITION-REQUIREMENTS-001](FDD.md#req-position-requirements-001) | [TDD#READ](TDD.md#read)     | TEST-POSITION-REQUIREMENTS-001 |
| [REQ-POSITION-REQUIREMENTS-002](FDD.md#req-position-requirements-002) | [TDD#ACTION](TDD.md#action) | TEST-POSITION-REQUIREMENTS-002 |
| [REQ-POSITION-REQUIREMENTS-003](FDD.md#req-position-requirements-003) | [TDD#AUTH](TDD.md#auth)     | TEST-POSITION-REQUIREMENTS-003 |
| [REQ-POSITION-REQUIREMENTS-004](FDD.md#req-position-requirements-004) | [TDD#RULES](TDD.md#rules)   | TEST-POSITION-REQUIREMENTS-004 |
| [REQ-POSITION-REQUIREMENTS-005](FDD.md#req-position-requirements-005) | [TDD#AUTH](TDD.md#auth)     | TEST-POSITION-REQUIREMENTS-005 |
| [REQ-POSITION-REQUIREMENTS-006](FDD.md#req-position-requirements-006) | [TDD#UX](TDD.md#ux)         | TEST-POSITION-REQUIREMENTS-006 |
| [REQ-POSITION-REQUIREMENTS-007](FDD.md#req-position-requirements-007) | [TDD#DATA](TDD.md#data)     | TEST-POSITION-REQUIREMENTS-007 |

## TEST-POSITION-REQUIREMENTS-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A waived requirement still shows its source and a Waived status; the list matches the published position version.

Assert: Show the effective requirement set at today: profile requirements with applied position variances, each labelled Profile or Position and showing any variance.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-POSITION-REQUIREMENTS-002

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Replace or Strengthen without a source requirement, duplicate codes and negative quantities are rejected with field errors.

Assert: Propose Add, Replace and Strengthen variances (all allowed per DEC-HCM2-009), with unique requirement codes and valid quantity and unit pairs. Replace and Strengthen reference the source profile requirement.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-POSITION-REQUIREMENTS-003

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A request containing a Waive cannot be approved by an actor without the waive permission; the justification never appears in logs or audit.

Assert: Per DEC-HCM2-009, a Waive preserves the source requirement and needs an encrypted justification and an impact preview. It can be approved only by an independent approver holding both the approve and the waive permissions.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-POSITION-REQUIREMENTS-004

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Rejected or withdrawn requests leave the effective set unchanged; the Positions app shows the same request.

Assert: Variances are items of a position change request of type Change and use the Positions approval policy: one independent approver (DEC-HCM2-008). The effective set changes only when applied.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-POSITION-REQUIREMENTS-005

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.job-architecture` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-POSITION-REQUIREMENTS-006

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-POSITION-REQUIREMENTS-007

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

Assert: Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
