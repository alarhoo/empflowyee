# Job Catalogue — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                           | Design                      | Planned test           |
| ----------------------------------------------------- | --------------------------- | ---------------------- |
| [REQ-JOB-CATALOGUE-001](FDD.md#req-job-catalogue-001) | [TDD#READ](TDD.md#read)     | TEST-JOB-CATALOGUE-001 |
| [REQ-JOB-CATALOGUE-002](FDD.md#req-job-catalogue-002) | [TDD#ACTION](TDD.md#action) | TEST-JOB-CATALOGUE-002 |
| [REQ-JOB-CATALOGUE-003](FDD.md#req-job-catalogue-003) | [TDD#ACTION](TDD.md#action) | TEST-JOB-CATALOGUE-003 |
| [REQ-JOB-CATALOGUE-004](FDD.md#req-job-catalogue-004) | [TDD#RULES](TDD.md#rules)   | TEST-JOB-CATALOGUE-004 |
| [REQ-JOB-CATALOGUE-005](FDD.md#req-job-catalogue-005) | [TDD#AUTH](TDD.md#auth)     | TEST-JOB-CATALOGUE-005 |
| [REQ-JOB-CATALOGUE-006](FDD.md#req-job-catalogue-006) | [TDD#UX](TDD.md#ux)         | TEST-JOB-CATALOGUE-006 |
| [REQ-JOB-CATALOGUE-007](FDD.md#req-job-catalogue-007) | [TDD#DATA](TDD.md#data)     | TEST-JOB-CATALOGUE-007 |

## TEST-JOB-CATALOGUE-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Published and superseded versions are read-only; the current pointer references exactly one published version.

Assert: Show catalogue versions with status and effective range, and for a selected version its family tree, tracks with ordered levels and bands with ordered grades.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-JOB-CATALOGUE-002

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A third family level, a third track kind, cycles, duplicate codes or sequences and edits to non-draft versions fail with field errors.

Assert: Create a draft successor from a published version. Add, edit and retire job families at most two levels deep, levels within the two supported tracks (Individual Contributor and Management), and bands with their grades. Sequences are unique per parent.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-JOB-CATALOGUE-003

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Cross-version references, zero or two defaults and negative quantities are rejected; profiles contain no salary or person data.

Assert: Create a profile with a draft version that references one published catalogue version and its family, track and level. Maintain responsibilities, requirements and allowed grades with exactly one default.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-JOB-CATALOGUE-004

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Concurrent publishes serialize; overlapping ranges are rejected by the exclusion constraint; a published version cannot be updated even by direct SQL as runtime.

Assert: Draft moves to InReview, then Published with an effective-from date. Publishing closes the previous version’s range, moves the current pointer and never changes existing positions or assignments.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-JOB-CATALOGUE-005

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.job-architecture` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-JOB-CATALOGUE-006

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-JOB-CATALOGUE-007

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

Assert: Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
