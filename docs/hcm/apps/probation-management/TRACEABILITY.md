# Probation Management — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                                         | Design                      | Planned test                  |
| ------------------------------------------------------------------- | --------------------------- | ----------------------------- |
| [REQ-PROBATION-MANAGEMENT-001](FDD.md#req-probation-management-001) | [TDD#READ](TDD.md#read)     | TEST-PROBATION-MANAGEMENT-001 |
| [REQ-PROBATION-MANAGEMENT-002](FDD.md#req-probation-management-002) | [TDD#ACTION](TDD.md#action) | TEST-PROBATION-MANAGEMENT-002 |
| [REQ-PROBATION-MANAGEMENT-003](FDD.md#req-probation-management-003) | [TDD#RULES](TDD.md#rules)   | TEST-PROBATION-MANAGEMENT-003 |
| [REQ-PROBATION-MANAGEMENT-004](FDD.md#req-probation-management-004) | [TDD#RULES](TDD.md#rules)   | TEST-PROBATION-MANAGEMENT-004 |
| [REQ-PROBATION-MANAGEMENT-005](FDD.md#req-probation-management-005) | [TDD#AUTH](TDD.md#auth)     | TEST-PROBATION-MANAGEMENT-005 |
| [REQ-PROBATION-MANAGEMENT-006](FDD.md#req-probation-management-006) | [TDD#UX](TDD.md#ux)         | TEST-PROBATION-MANAGEMENT-006 |
| [REQ-PROBATION-MANAGEMENT-007](FDD.md#req-probation-management-007) | [TDD#DATA](TDD.md#data)     | TEST-PROBATION-MANAGEMENT-007 |

## TEST-PROBATION-MANAGEMENT-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Confirmed and NotApplicable employments are excluded; overdue matches the server calculation.

Assert: List employments in probation (InProgress or Extended) with end date, next review and overdue state computed server-side in the organisation time zone.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-PROBATION-MANAGEMENT-002

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Creating a worker with a probation end date creates exactly one Final review without a reviewer; assigning the reviewer notifies them; reassignment removes the prior reviewer’s access.

Assert: Per DEC-HCM2-003, when an employment enters probation the Employee domain creates one Final review due 14 days before the probation end date, in the same transaction. HR assigns an explicit reviewer account, optionally prefilled with the current manager; the stored reviewer is the authority. HR may also schedule an ad-hoc review.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-PROBATION-MANAGEMENT-003

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A second extension or one beyond 90 days is rejected; Fail does not end employment or create an exit; the prior decision is preserved after an extension.

Assert: Record Confirm, Extend, Fail or NoChange with an effective date and reason, separate from the assessment. Confirm and Extend update employment probation facts through the workforce port. Per DEC-HCM2-003, at most one extension is allowed, ending no more than 90 days after the original end date, and it creates the next Final review due 14 days before the new end.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-PROBATION-MANAGEMENT-004

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A review 8 days past due shows Escalated for Toby; no notification is fabricated.

Assert: Per DEC-HCM2-003, a review still undecided 7 days after its due date is Escalated to its owning HR account. HCM-2 computes this state at read time and shows it in HR views. The escalation notification needs a background runtime and is deferred.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-PROBATION-MANAGEMENT-005

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-PROBATION-MANAGEMENT-006

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-PROBATION-MANAGEMENT-007

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

Assert: Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
