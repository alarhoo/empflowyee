# Identification Types — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                                         | Design                      | Planned test                  |
| ------------------------------------------------------------------- | --------------------------- | ----------------------------- |
| [REQ-IDENTIFICATION-TYPES-001](FDD.md#req-identification-types-001) | [TDD#READ](TDD.md#read)     | TEST-IDENTIFICATION-TYPES-001 |
| [REQ-IDENTIFICATION-TYPES-002](FDD.md#req-identification-types-002) | [TDD#ACTION](TDD.md#action) | TEST-IDENTIFICATION-TYPES-002 |
| [REQ-IDENTIFICATION-TYPES-003](FDD.md#req-identification-types-003) | [TDD#RULES](TDD.md#rules)   | TEST-IDENTIFICATION-TYPES-003 |
| [REQ-IDENTIFICATION-TYPES-004](FDD.md#req-identification-types-004) | [TDD#AUTH](TDD.md#auth)     | TEST-IDENTIFICATION-TYPES-004 |
| [REQ-IDENTIFICATION-TYPES-005](FDD.md#req-identification-types-005) | [TDD#UX](TDD.md#ux)         | TEST-IDENTIFICATION-TYPES-005 |

## TEST-IDENTIFICATION-TYPES-001

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Rows come from the global product table; retired types show Inactive; the validation expression is described in words and never returned raw.

Assert: List every product identification type with code, name, issuing country or _All countries_, unique-per-person, requires-masking, required-for-payroll and active state.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-IDENTIFICATION-TYPES-002

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Mutation methods have no handler; runtime has SELECT only on `identification_type`; no mutation control renders for any persona.

Assert: Per DEC-HCM2-016, tenants view the catalogue only. New or changed types arrive as product updates through migrations. No tenant manage endpoint, permission or control exists.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-IDENTIFICATION-TYPES-003

Type: unit.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: DTO allowlist contains no value, hash, count or person reference; SQL reads only `identification_type` and `country`.

Assert: The app never shows, stores, counts or exports any person’s identification value.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-IDENTIFICATION-TYPES-004

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.workforce-foundation` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-IDENTIFICATION-TYPES-005

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
