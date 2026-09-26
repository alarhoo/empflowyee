# Employment Changes — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                                     | Design                      | Planned test                |
| --------------------------------------------------------------- | --------------------------- | --------------------------- |
| [REQ-EMPLOYMENT-CHANGES-001](FDD.md#req-employment-changes-001) | [TDD#ACTION](TDD.md#action) | TEST-EMPLOYMENT-CHANGES-001 |
| [REQ-EMPLOYMENT-CHANGES-002](FDD.md#req-employment-changes-002) | [TDD#AUTH](TDD.md#auth)     | TEST-EMPLOYMENT-CHANGES-002 |
| [REQ-EMPLOYMENT-CHANGES-003](FDD.md#req-employment-changes-003) | [TDD#RULES](TDD.md#rules)   | TEST-EMPLOYMENT-CHANGES-003 |
| [REQ-EMPLOYMENT-CHANGES-004](FDD.md#req-employment-changes-004) | [TDD#ACTION](TDD.md#action) | TEST-EMPLOYMENT-CHANGES-004 |
| [REQ-EMPLOYMENT-CHANGES-005](FDD.md#req-employment-changes-005) | [TDD#READ](TDD.md#read)     | TEST-EMPLOYMENT-CHANGES-005 |
| [REQ-EMPLOYMENT-CHANGES-006](FDD.md#req-employment-changes-006) | [TDD#AUTH](TDD.md#auth)     | TEST-EMPLOYMENT-CHANGES-006 |
| [REQ-EMPLOYMENT-CHANGES-007](FDD.md#req-employment-changes-007) | [TDD#UX](TDD.md#ux)         | TEST-EMPLOYMENT-CHANGES-007 |
| [REQ-EMPLOYMENT-CHANGES-008](FDD.md#req-employment-changes-008) | [TDD#DATA](TDD.md#data)     | TEST-EMPLOYMENT-CHANGES-008 |

## TEST-EMPLOYMENT-CHANGES-001

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Invalid targets for the type, retired structure, a second nonterminal request overlapping the same employment and date, and a stale expected revision are rejected.

Assert: Support Rehire, Transfer, Promotion, Demotion, LocationChange, ManagerChange, HoursChange, EmploymentTypeChange, Suspension, ReturnToWork and Correction, each with its own target fields, including a target position. The server validates against current facts.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYMENT-CHANGES-002

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Self-approval returns 403 `self-approval-forbidden`; a date 31 days back (91 for Correction) returns 400 `effective-date-out-of-range`.

Assert: Per DEC-HCM2-002, every change type has one approval slot filled by an approver who is not the requester. The effective date may be at most 30 days before submission, or 90 days for Correction. Future dates are allowed.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYMENT-CHANGES-003

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Any failing step rolls back all steps; exclusion constraints hold; future-dated employment-level changes stay Approved until Apply.

Assert: Execution closes and opens dated rows, updates reporting lines, checks position capacity (reject beyond headcount or FTE capacity, per DEC-HCM2-007) and records one worker event per employment. Employment-level facts apply only on or after the effective date.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYMENT-CHANGES-004

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Rehire never creates a second person or worker; a correction keeps the replaced row in history.

Assert: Rehire creates a new employment for an existing worker with the next sequence number and shows rehire eligibility. Correction changes a dated row or establishes an incomplete record with a reason and a correction event.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYMENT-CHANGES-005

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Cancelled and rejected requests change no workforce fact.

Assert: Requests show status, approvals and execution steps. The requester can cancel a request that is Draft, PendingApproval or Approved but not executed.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYMENT-CHANGES-006

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYMENT-CHANGES-007

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYMENT-CHANGES-008

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

Assert: Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
