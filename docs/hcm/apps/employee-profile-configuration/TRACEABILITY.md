# Employee Profile Configuration — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                                                             | Design                      | Planned test                            |
| --------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------- |
| [REQ-EMPLOYEE-PROFILE-CONFIGURATION-001](FDD.md#req-employee-profile-configuration-001) | [TDD#READ](TDD.md#read)     | TEST-EMPLOYEE-PROFILE-CONFIGURATION-001 |
| [REQ-EMPLOYEE-PROFILE-CONFIGURATION-002](FDD.md#req-employee-profile-configuration-002) | [TDD#RULES](TDD.md#rules)   | TEST-EMPLOYEE-PROFILE-CONFIGURATION-002 |
| [REQ-EMPLOYEE-PROFILE-CONFIGURATION-003](FDD.md#req-employee-profile-configuration-003) | [TDD#ACTION](TDD.md#action) | TEST-EMPLOYEE-PROFILE-CONFIGURATION-003 |
| [REQ-EMPLOYEE-PROFILE-CONFIGURATION-004](FDD.md#req-employee-profile-configuration-004) | [TDD#RULES](TDD.md#rules)   | TEST-EMPLOYEE-PROFILE-CONFIGURATION-004 |
| [REQ-EMPLOYEE-PROFILE-CONFIGURATION-005](FDD.md#req-employee-profile-configuration-005) | [TDD#READ](TDD.md#read)     | TEST-EMPLOYEE-PROFILE-CONFIGURATION-005 |
| [REQ-EMPLOYEE-PROFILE-CONFIGURATION-006](FDD.md#req-employee-profile-configuration-006) | [TDD#AUTH](TDD.md#auth)     | TEST-EMPLOYEE-PROFILE-CONFIGURATION-006 |
| [REQ-EMPLOYEE-PROFILE-CONFIGURATION-007](FDD.md#req-employee-profile-configuration-007) | [TDD#UX](TDD.md#ux)         | TEST-EMPLOYEE-PROFILE-CONFIGURATION-007 |
| [REQ-EMPLOYEE-PROFILE-CONFIGURATION-008](FDD.md#req-employee-profile-configuration-008) | [TDD#DATA](TDD.md#data)     | TEST-EMPLOYEE-PROFILE-CONFIGURATION-008 |

## TEST-EMPLOYEE-PROFILE-CONFIGURATION-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Values match the migrated product catalogue derived from the profile field policy; unlisted fields show the restrictive default.

Assert: List product standard fields with section, sensitivity, maximum visibility, searchability and product default requiredness, visibility and self-edit mode.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-PROFILE-CONFIGURATION-002

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A widening attempt returns 400 `visibility-ceiling-exceeded`; reset returns to the product default; the change affects the next read of every consuming app.

Assert: For the WorkforceActivation context and ordinary display, set requiredness, visibility (never above the ceiling), self-edit mode (never more permissive than the product default) and whether worker preferences are allowed.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-PROFILE-CONFIGURATION-003

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Owner scope and data type cannot change after the first stored value; option codes are unique per field.

Assert: Create a custom field with code, name, description, owner scope (Person, Worker, Employment or Assignment), data type, sensitivity, section and searchable-when-visible (DirectorySafe only). Select types have options.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-PROFILE-CONFIGURATION-004

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Retired fields disappear from edit forms and remain readable to authorized viewers; no delete exists.

Assert: Retire a custom field or option to stop new values while keeping existing values and history.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-PROFILE-CONFIGURATION-005

Type: unit.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: The preview matches actual DTO serialization for the four seeded personas.

Assert: For a selected field, show the effective visibility and edit mode for Self, Manager, HR and Organization viewers using the same evaluator the APIs use.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-PROFILE-CONFIGURATION-006

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-PROFILE-CONFIGURATION-007

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-PROFILE-CONFIGURATION-008

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

Assert: Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
