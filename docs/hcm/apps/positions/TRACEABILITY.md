# Positions — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                   | Design                      | Planned test       |
| --------------------------------------------- | --------------------------- | ------------------ |
| [REQ-POSITIONS-001](FDD.md#req-positions-001) | [TDD#READ](TDD.md#read)     | TEST-POSITIONS-001 |
| [REQ-POSITIONS-002](FDD.md#req-positions-002) | [TDD#ACTION](TDD.md#action) | TEST-POSITIONS-002 |
| [REQ-POSITIONS-003](FDD.md#req-positions-003) | [TDD#RULES](TDD.md#rules)   | TEST-POSITIONS-003 |
| [REQ-POSITIONS-004](FDD.md#req-positions-004) | [TDD#AUTH](TDD.md#auth)     | TEST-POSITIONS-004 |
| [REQ-POSITIONS-005](FDD.md#req-positions-005) | [TDD#RULES](TDD.md#rules)   | TEST-POSITIONS-005 |
| [REQ-POSITIONS-006](FDD.md#req-positions-006) | [TDD#AUTH](TDD.md#auth)     | TEST-POSITIONS-006 |
| [REQ-POSITIONS-007](FDD.md#req-positions-007) | [TDD#UX](TDD.md#ux)         | TEST-POSITIONS-007 |
| [REQ-POSITIONS-008](FDD.md#req-positions-008) | [TDD#DATA](TDD.md#data)     | TEST-POSITIONS-008 |

## TEST-POSITIONS-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Occupancy counts effective assignments linked to the position at today; unavailable occupancy is never shown as zero.

Assert: List positions with code, name, lifecycle status, placement, capacity, occupied headcount and FTE, and remaining capacity. Remaining is shown only when occupancy is complete; otherwise _Occupancy unavailable_ is shown.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-POSITIONS-002

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Grade not allowed by the profile, retired structure, non-positive capacity and duplicate code are rejected before submission.

Assert: Enter code, name, published profile version, allowed grade, designation, legal entity, unit, department, location, type, headcount capacity, FTE capacity, key-position flag, cost centre and effective-from date, then preview and submit.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-POSITIONS-003

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A stale or expired preview blocks submission with 409 `preview-stale`; closing a staffed position leaves its assignments unchanged.

Assert: Request Change, Freeze, Reopen, Close or Cancel with a reason. The preview shows active assignments, assigned FTE, child positions and downstream references. Closing or freezing never ends an assignment.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-POSITIONS-004

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Self-approval, duplicate decisions and decisions on changed requests are rejected; approval and application are atomic.

Assert: Per DEC-HCM2-008, every request type (Create, Change, Freeze, Reopen, Close, Cancel and requirement changes) needs one approver who is not the requester. A decision binds to the request revision, preview digest and state; applying it publishes the successor version or lifecycle status.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-POSITIONS-005

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: An assignment that would take headcount or FTE above capacity returns 409 `capacity-exceeded`; incomplete occupancy returns 409 `occupancy-unknown`; neither changes any fact.

Assert: Per DEC-HCM2-007, partial FTE assignments are allowed. An assignment is rejected if it would exceed the headcount capacity or the FTE capacity. There is no overfill. When occupancy is incomplete the check fails safely.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-POSITIONS-006

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.job-architecture` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-POSITIONS-007

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-POSITIONS-008

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

Assert: Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
