# Organization Structure — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                                             | Design                      | Planned test                    |
| ----------------------------------------------------------------------- | --------------------------- | ------------------------------- |
| [REQ-ORGANIZATION-STRUCTURE-001](FDD.md#req-organization-structure-001) | [TDD#READ](TDD.md#read)     | TEST-ORGANIZATION-STRUCTURE-001 |
| [REQ-ORGANIZATION-STRUCTURE-002](FDD.md#req-organization-structure-002) | [TDD#ACTION](TDD.md#action) | TEST-ORGANIZATION-STRUCTURE-002 |
| [REQ-ORGANIZATION-STRUCTURE-003](FDD.md#req-organization-structure-003) | [TDD#ACTION](TDD.md#action) | TEST-ORGANIZATION-STRUCTURE-003 |
| [REQ-ORGANIZATION-STRUCTURE-004](FDD.md#req-organization-structure-004) | [TDD#RULES](TDD.md#rules)   | TEST-ORGANIZATION-STRUCTURE-004 |
| [REQ-ORGANIZATION-STRUCTURE-005](FDD.md#req-organization-structure-005) | [TDD#RULES](TDD.md#rules)   | TEST-ORGANIZATION-STRUCTURE-005 |
| [REQ-ORGANIZATION-STRUCTURE-006](FDD.md#req-organization-structure-006) | [TDD#ACTION](TDD.md#action) | TEST-ORGANIZATION-STRUCTURE-006 |
| [REQ-ORGANIZATION-STRUCTURE-007](FDD.md#req-organization-structure-007) | [TDD#AUTH](TDD.md#auth)     | TEST-ORGANIZATION-STRUCTURE-007 |
| [REQ-ORGANIZATION-STRUCTURE-008](FDD.md#req-organization-structure-008) | [TDD#UX](TDD.md#ux)         | TEST-ORGANIZATION-STRUCTURE-008 |
| [REQ-ORGANIZATION-STRUCTURE-009](FDD.md#req-organization-structure-009) | [TDD#DATA](TDD.md#data)     | TEST-ORGANIZATION-STRUCTURE-009 |

## TEST-ORGANIZATION-STRUCTURE-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Future and closed unit versions are excluded at the chosen date; retired items remain visible with Inactive status.

Assert: List each area’s items with code, name, active state and key attributes. Units display as a hierarchy at an as-of date, defaulting to today in the organisation time zone.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-ORGANIZATION-STRUCTURE-002

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Invalid time zones, day 31 for a 30-day month and inactive locations are rejected; the display name has no edit control.

Assert: Edit the organisation profile: default time zone (IANA), default language (BCP 47), default currency, financial-year start month and day, and headquarters location. The organisation display name stays the Account-owned tenant name.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-ORGANIZATION-STRUCTURE-003

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Codes are unique per tenant and immutable; closing an entity with open employments returns 409 `structure-in-use`; there is no delete.

Assert: Create and edit legal entities with code, name, registered name, entity type, country, statutory employer identifiers, registered location, reporting currency, financial-year start and incorporation and operations dates. A legal entity closes by setting its operations-closed date.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-ORGANIZATION-STRUCTURE-004

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Type-chain cycles are rejected; disabling a type hides it from new units but keeps existing units valid.

Assert: Define the unit type chain (parent type), whether a level bears a legal entity, whether several units may share a parent, display names and enablement.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-ORGANIZATION-STRUCTURE-005

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Overlapping versions, cycles, a parent type outside the chain and retiring a unit with current or future assignments or positions are rejected; path and depth stay consistent after reparenting.

Assert: Create a unit with its first version (type, parent, name, legal entity on bearing levels, primary location, cost centre, head worker, effective-from). Change name or placement by adding a version from a date. Retire a unit from a date, optionally naming a successor.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-ORGANIZATION-STRUCTURE-006

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A designation carries no grade or authorization meaning; retiring an item referenced by a current assignment or position returns 409 `structure-in-use`.

Assert: Create, edit, retire and reactivate departments (parent, head, cost centre, target headcount), designations (title only, display order) and locations (type, address, time zone, virtual flag, geofence fields).

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-ORGANIZATION-STRUCTURE-007

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor and foreign tenant fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.workforce-foundation` and tenant scope. Browser visibility never authorizes an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-ORGANIZATION-STRUCTURE-008

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-ORGANIZATION-STRUCTURE-009

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: PostgreSQL exclusion constraints and RLS hold under failure injection; replay with the same key returns the first response.

Assert: Commands persist state, revision, audit event and idempotency receipt in one transaction. Unit versions are never rewritten; changes close the previous version.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
