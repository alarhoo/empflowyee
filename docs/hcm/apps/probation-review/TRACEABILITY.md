# Probation Review — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                                 | Design                      | Planned test              |
| ----------------------------------------------------------- | --------------------------- | ------------------------- |
| [REQ-PROBATION-REVIEW-001](FDD.md#req-probation-review-001) | [TDD#AUTH](TDD.md#auth)     | TEST-PROBATION-REVIEW-001 |
| [REQ-PROBATION-REVIEW-002](FDD.md#req-probation-review-002) | [TDD#ACTION](TDD.md#action) | TEST-PROBATION-REVIEW-002 |
| [REQ-PROBATION-REVIEW-003](FDD.md#req-probation-review-003) | [TDD#RULES](TDD.md#rules)   | TEST-PROBATION-REVIEW-003 |
| [REQ-PROBATION-REVIEW-004](FDD.md#req-probation-review-004) | [TDD#READ](TDD.md#read)     | TEST-PROBATION-REVIEW-004 |
| [REQ-PROBATION-REVIEW-005](FDD.md#req-probation-review-005) | [TDD#UX](TDD.md#ux)         | TEST-PROBATION-REVIEW-005 |

## TEST-PROBATION-REVIEW-001

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Being the worker’s manager without being the stored reviewer shows nothing; reassignment removes access on the next request.

Assert: List reviews whose stored reviewer is the verified account, with due date and status.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-PROBATION-REVIEW-002

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Ratings outside 1–5 or non-integers and missing reasons are rejected; HR is notified on submission.

Assert: Submit a recommendation (Confirm, Extend, Fail, NoChange), an overall rating from 1 to 5 (DEC-HCM2-003), strengths, concerns and a recommendation reason.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-PROBATION-REVIEW-003

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Superseded assessments stay in history; submission after decision returns 409.

Assert: A new submission supersedes the previous assessment while the review is undecided. After the HR decision, assessments are read-only.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-PROBATION-REVIEW-004

Type: unit.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: The reviewer DTO contains no personal, contact or family fields.

Assert: Show only name, designation, unit, hire date, probation period and previous decisions. No personal data.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-PROBATION-REVIEW-005

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
