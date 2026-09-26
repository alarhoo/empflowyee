# Employee Directory — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                                     | Design                    | Planned test                |
| --------------------------------------------------------------- | ------------------------- | --------------------------- |
| [REQ-EMPLOYEE-DIRECTORY-001](FDD.md#req-employee-directory-001) | [TDD#READ](TDD.md#read)   | TEST-EMPLOYEE-DIRECTORY-001 |
| [REQ-EMPLOYEE-DIRECTORY-002](FDD.md#req-employee-directory-002) | [TDD#RULES](TDD.md#rules) | TEST-EMPLOYEE-DIRECTORY-002 |
| [REQ-EMPLOYEE-DIRECTORY-003](FDD.md#req-employee-directory-003) | [TDD#UX](TDD.md#ux)       | TEST-EMPLOYEE-DIRECTORY-003 |
| [REQ-EMPLOYEE-DIRECTORY-004](FDD.md#req-employee-directory-004) | [TDD#RULES](TDD.md#rules) | TEST-EMPLOYEE-DIRECTORY-004 |
| [REQ-EMPLOYEE-DIRECTORY-005](FDD.md#req-employee-directory-005) | [TDD#AUTH](TDD.md#auth)   | TEST-EMPLOYEE-DIRECTORY-005 |
| [REQ-EMPLOYEE-DIRECTORY-006](FDD.md#req-employee-directory-006) | [TDD#UX](TDD.md#ux)       | TEST-EMPLOYEE-DIRECTORY-006 |

## TEST-EMPLOYEE-DIRECTORY-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Search never matches hidden fields, personal contacts or identifiers; results are paged and stable under equal names.

Assert: Search by normalized name (contains), work email and worker number (exact or prefix), with unit, department, location and designation filters and name sorting.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-DIRECTORY-002

Type: unit.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Narrowing work email to HR removes it from results, detail and search matching on the next request.

Assert: Every field shown or searched has effective Organization visibility at the same instant, after tenant policy and allowed worker preferences.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-DIRECTORY-003

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Detail DTO equals the Organization allowlist; the manager link opens that manager’s entry.

Assert: Show display name, designation, department, unit, location, work email link, worker number, manager and direct reports. Concurrent assignments are listed explicitly.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-DIRECTORY-004

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A future hire and an ended employee never appear; a suspended employee appears without any status indication.

Assert: Include workers with an open employment (Active, OnNotice or Suspended) and a current assignment. Exclude Pending and Ended. Employment status itself is not shown.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-DIRECTORY-005

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-DIRECTORY-006

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
