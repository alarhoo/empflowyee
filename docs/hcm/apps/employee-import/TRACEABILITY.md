# Employee Import — requirement traceability

Status: design coverage complete; every test below is **planned, not executed**.

## MATRIX

| Requirement                                               | Design                      | Planned test             |
| --------------------------------------------------------- | --------------------------- | ------------------------ |
| [REQ-EMPLOYEE-IMPORT-001](FDD.md#req-employee-import-001) | [TDD#ACTION](TDD.md#action) | TEST-EMPLOYEE-IMPORT-001 |
| [REQ-EMPLOYEE-IMPORT-002](FDD.md#req-employee-import-002) | [TDD#RULES](TDD.md#rules)   | TEST-EMPLOYEE-IMPORT-002 |
| [REQ-EMPLOYEE-IMPORT-003](FDD.md#req-employee-import-003) | [TDD#READ](TDD.md#read)     | TEST-EMPLOYEE-IMPORT-003 |
| [REQ-EMPLOYEE-IMPORT-004](FDD.md#req-employee-import-004) | [TDD#RULES](TDD.md#rules)   | TEST-EMPLOYEE-IMPORT-004 |
| [REQ-EMPLOYEE-IMPORT-005](FDD.md#req-employee-import-005) | [TDD#DATA](TDD.md#data)     | TEST-EMPLOYEE-IMPORT-005 |
| [REQ-EMPLOYEE-IMPORT-006](FDD.md#req-employee-import-006) | [TDD#AUTH](TDD.md#auth)     | TEST-EMPLOYEE-IMPORT-006 |
| [REQ-EMPLOYEE-IMPORT-007](FDD.md#req-employee-import-007) | [TDD#AUTH](TDD.md#auth)     | TEST-EMPLOYEE-IMPORT-007 |
| [REQ-EMPLOYEE-IMPORT-008](FDD.md#req-employee-import-008) | [TDD#UX](TDD.md#ux)         | TEST-EMPLOYEE-IMPORT-008 |

## TEST-EMPLOYEE-IMPORT-001

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Mapping a non-importable field or an unknown transformation fails; editing a published template requires a new version.

Assert: Define templates with format (CSV or XLSX), header row, date format, time zone and columns mapped to importable standard or custom fields, allow-listed transformations and match-key columns. Publishing makes a template version immutable.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-IMPORT-002

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Oversize, spoofed, macro-enabled or encrypted files are rejected; a started run cannot change its file or template.

Assert: Upload a file up to 5 MiB and 2,000 data rows for a chosen template and intended action (Create, Update or Upsert). The source digest, parser version and template version become immutable when validation starts.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-IMPORT-003

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Row counts in workforce tables are unchanged after validation; issue messages never contain source values.

Assert: Validation parses, transforms and checks every row and records issues with safe codes and messages. It computes match status per DEC-HCM2-001: Unique or Ambiguous when existing people match on normalized legal name plus birth date or on work email, None otherwise.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-IMPORT-004

Type: domain-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: A run with any unresolved matched row cannot commit that row; resolutions are recorded per row with the resolving account.

Assert: Per DEC-HCM2-001, every matched row needs an HR resolution before commit: use the existing person (Update or Upsert), create new with a reason, or skip the row. Automatic merge is forbidden.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-IMPORT-005

Type: postgresql-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Retrying commit after a mid-run failure applies only remaining rows; totals reconcile with row statuses.

Assert: Commit applies each valid row through `WorkforceFactsPort` with a row idempotency key. Committed rows are never replayed; failed rows record a safe failure code. No invitations are created.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-IMPORT-006

Type: api-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: The report contains no personal values; an export audit event is appended.

Assert: Download a CSV of row numbers, field names, issue codes and severities with no source values. The download is audited as an export.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-IMPORT-007

Type: security-integration.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

Assert: Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.

## TEST-EMPLOYEE-IMPORT-008

Type: browser-accessibility.

Setup: versioned Dunder Mifflin seeds or isolated test fixtures; tenants A and B, a permitted actor and a denied actor.

Exercise: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

Assert: Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Evidence: record the test path, run and result in the implementation validation record. Nothing is executed by this design.
