# Org Chart — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                   | Design                    | Planned test       |
| --------------------------------------------- | ------------------------- | ------------------ |
| [REQ-ORG-CHART-001](FDD.md#req-org-chart-001) | [TDD#READ](TDD.md#read)   | TEST-ORG-CHART-001 |
| [REQ-ORG-CHART-002](FDD.md#req-org-chart-002) | [TDD#READ](TDD.md#read)   | TEST-ORG-CHART-002 |
| [REQ-ORG-CHART-003](FDD.md#req-org-chart-003) | [TDD#UX](TDD.md#ux)       | TEST-ORG-CHART-003 |
| [REQ-ORG-CHART-004](FDD.md#req-org-chart-004) | [TDD#RULES](TDD.md#rules) | TEST-ORG-CHART-004 |
| [REQ-ORG-CHART-005](FDD.md#req-org-chart-005) | [TDD#AUTH](TDD.md#auth)   | TEST-ORG-CHART-005 |
| [REQ-ORG-CHART-006](FDD.md#req-org-chart-006) | [TDD#UX](TDD.md#ux)       | TEST-ORG-CHART-006 |

## TEST-ORG-CHART-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Multiple roots render; closed and future lines are excluded; a manager with 120 reports needs three bounded requests; no request loads the whole tenant.

Assert: Build the hierarchy from current primary solid reporting lines as of today in the organisation time zone. Children load in pages of 50 sorted by display name with a _Load more_ item.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-ORG-CHART-002

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Search never matches personal email, identifiers or hidden fields; a reporting cycle in data is reported as a safe error, not an infinite loop.

Assert: Search by normalized name (minimum two characters) or worker number prefix. Selecting a result loads its ancestor path (bounded to 50 levels), expands it and selects the node.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-ORG-CHART-003

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A tenant policy narrowing work email removes it from the DTO and UI; a person with two primary assignments shows two labelled nodes.

Assert: Show display name, designation, organisation unit, department, location, work email and manager when their effective visibility is Organization, plus direct reports. Concurrent assignments appear as separate nodes labelled with their legal entity or unit.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-ORG-CHART-004

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Being someone’s manager in the chart does not change any other API response; Pending and Ended employments never appear.

Assert: The chart grants no access and enables no action. Links to other apps appear only when those apps are discoverable, and destinations re-authorize.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-ORG-CHART-005

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.workforce-foundation` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-ORG-CHART-006

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
