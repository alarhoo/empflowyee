# HR Service Desk — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                               | Design                      | Planned test             |
| --------------------------------------------------------- | --------------------------- | ------------------------ |
| [REQ-HR-SERVICE-DESK-001](FDD.md#req-hr-service-desk-001) | [TDD#READ](TDD.md#read)     | TEST-HR-SERVICE-DESK-001 |
| [REQ-HR-SERVICE-DESK-002](FDD.md#req-hr-service-desk-002) | [TDD#RULES](TDD.md#rules)   | TEST-HR-SERVICE-DESK-002 |
| [REQ-HR-SERVICE-DESK-003](FDD.md#req-hr-service-desk-003) | [TDD#AUTH](TDD.md#auth)     | TEST-HR-SERVICE-DESK-003 |
| [REQ-HR-SERVICE-DESK-004](FDD.md#req-hr-service-desk-004) | [TDD#ACTION](TDD.md#action) | TEST-HR-SERVICE-DESK-004 |
| [REQ-HR-SERVICE-DESK-005](FDD.md#req-hr-service-desk-005) | [TDD#DATA](TDD.md#data)     | TEST-HR-SERVICE-DESK-005 |
| [REQ-HR-SERVICE-DESK-006](FDD.md#req-hr-service-desk-006) | [TDD#ACTION](TDD.md#action) | TEST-HR-SERVICE-DESK-006 |
| [REQ-HR-SERVICE-DESK-007](FDD.md#req-hr-service-desk-007) | [TDD#AUTH](TDD.md#auth)     | TEST-HR-SERVICE-DESK-007 |
| [REQ-HR-SERVICE-DESK-008](FDD.md#req-hr-service-desk-008) | [TDD#UX](TDD.md#ux)         | TEST-HR-SERVICE-DESK-008 |

## TEST-HR-SERVICE-DESK-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Queue order follows the earliest running SLA target; team views show only requests routed to the actor’s teams.

Assert: List accessible requests by view, with filters for status, priority, type and SLA state, sorted by due time.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-HR-SERVICE-DESK-002

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Self endpoints, notifications and search never contain internal content.

Assert: Replies are employee-visible and notify the requester; internal notes and internal attachments are never visible to employees.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-HR-SERVICE-DESK-003

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Removing a membership changes routing only; access still depends on the handle permission.

Assert: Assign or reassign to a team and agent with a reason. Team membership routes work but does not authorize access.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-HR-SERVICE-DESK-004

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Invalid transitions return 409; every transition is audited and emitted to the requester when employee-visible.

Assert: New, Open, WaitingForEmployee, WaitingForHr, Resolved with a resolution code, Closed, Cancelled. Per DEC-HCM2-004, the requester may reopen a Resolved request within 7 days of resolution; after that HR closes it.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-HR-SERVICE-DESK-005

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Due times, pauses, met and breached states match server calculations; a breach is derived when due time passes without the target being met, and persisted on the next write.

Assert: Per DEC-HCM2-004, targets run on a 24x7 calendar clock. First response and resolution targets are P1 4 hours and 1 day, P2 1 and 3 days, P3 2 and 5 days, P4 3 and 10 days. Clocks pause while waiting for the employee. No next-response target is used in HCM-2.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-HR-SERVICE-DESK-006

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Published policy versions are immutable; changes apply to new requests only.

Assert: Maintain teams, memberships, request types (category, audience, classification, default team, service level) and versioned service level policies.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-HR-SERVICE-DESK-007

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-HR-SERVICE-DESK-008

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
