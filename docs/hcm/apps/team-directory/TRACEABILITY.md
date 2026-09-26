# Team Directory — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                             | Design                    | Planned test            |
| ------------------------------------------------------- | ------------------------- | ----------------------- |
| [REQ-TEAM-DIRECTORY-001](FDD.md#req-team-directory-001) | [TDD#READ](TDD.md#read)   | TEST-TEAM-DIRECTORY-001 |
| [REQ-TEAM-DIRECTORY-002](FDD.md#req-team-directory-002) | [TDD#RULES](TDD.md#rules) | TEST-TEAM-DIRECTORY-002 |
| [REQ-TEAM-DIRECTORY-003](FDD.md#req-team-directory-003) | [TDD#AUTH](TDD.md#auth)   | TEST-TEAM-DIRECTORY-003 |
| [REQ-TEAM-DIRECTORY-004](FDD.md#req-team-directory-004) | [TDD#UX](TDD.md#ux)       | TEST-TEAM-DIRECTORY-004 |

## TEST-TEAM-DIRECTORY-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Michael sees Jim, Dwight and Pam only; an indirect report or dotted-line report never appears; a worker whose line moves elsewhere disappears on the next request.

Assert: List the workers in the actor’s team as of today. Per DEC-HCM2-015, the team is the actor’s direct reports: workers with an assignment whose current primary solid reporting line points to one of the actor’s current assignments. Dotted, temporary and indirect reports are excluded.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-TEAM-DIRECTORY-002

Type: unit.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: DTOs contain no birth date, address, personal contact, family or identifier fields for any member.

Assert: Show fields whose effective visibility includes Manager: placement, employment type, status, service dates, FTE, hours and probation facts. No personal or sensitive data.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-TEAM-DIRECTORY-003

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Removing Michael’s team grant denies the next request although his reporting lines are unchanged.

Assert: A reporting relationship selects subjects only for an actor who holds the team permission; it grants nothing by itself.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-TEAM-DIRECTORY-004

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
