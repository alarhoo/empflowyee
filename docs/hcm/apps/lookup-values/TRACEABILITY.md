# Lookup Values — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                           | Design                      | Planned test           |
| ----------------------------------------------------- | --------------------------- | ---------------------- |
| [REQ-LOOKUP-VALUES-001](FDD.md#req-lookup-values-001) | [TDD#READ](TDD.md#read)     | TEST-LOOKUP-VALUES-001 |
| [REQ-LOOKUP-VALUES-002](FDD.md#req-lookup-values-002) | [TDD#ACTION](TDD.md#action) | TEST-LOOKUP-VALUES-002 |
| [REQ-LOOKUP-VALUES-003](FDD.md#req-lookup-values-003) | [TDD#RULES](TDD.md#rules)   | TEST-LOOKUP-VALUES-003 |
| [REQ-LOOKUP-VALUES-004](FDD.md#req-lookup-values-004) | [TDD#RULES](TDD.md#rules)   | TEST-LOOKUP-VALUES-004 |
| [REQ-LOOKUP-VALUES-005](FDD.md#req-lookup-values-005) | [TDD#AUTH](TDD.md#auth)     | TEST-LOOKUP-VALUES-005 |
| [REQ-LOOKUP-VALUES-006](FDD.md#req-lookup-values-006) | [TDD#UX](TDD.md#ux)         | TEST-LOOKUP-VALUES-006 |
| [REQ-LOOKUP-VALUES-007](FDD.md#req-lookup-values-007) | [TDD#DATA](TDD.md#data)     | TEST-LOOKUP-VALUES-007 |

## TEST-LOOKUP-VALUES-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Values come from PostgreSQL; retired values remain visible with Inactive status; selection survives reload through the route.

Assert: List the eight lookup sets and, for a selected set, its values with code, name, description, sort order, active state and set-specific attributes.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-LOOKUP-VALUES-002

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Duplicate or malformed codes, unknown attributes and stale revisions fail with field errors; a code cannot change after creation.

Assert: Create a value with a unique uppercase code (letters, digits, underscore; 2–40), name (1–100), optional description (≤500), sort order and attributes. Worker types carry statutory class, payroll-eligible and benefit-eligible. End reasons carry voluntary, regrettable default and rehire-eligible default. Worker event types carry a product category. Edits change everything except the code.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-LOOKUP-VALUES-003

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A retired worker type still renders on existing workers and is absent from option endpoints; no DELETE handler or grant exists.

Assert: Retiring hides a value from new choices but keeps it valid for existing references and history. Reactivation is allowed. There is no delete.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-LOOKUP-VALUES-004

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Mutations against product sets return 400 `set-not-editable`; runtime has SELECT only on product tables.

Assert: Product sets are read-only for every tenant actor. The worker event type approval flag is display-only and governed by the employment-change approval matrix.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-LOOKUP-VALUES-005

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.workforce-foundation` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-LOOKUP-VALUES-006

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-LOOKUP-VALUES-007

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

Assert: Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
