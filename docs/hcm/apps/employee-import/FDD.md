# Employee Import — functional design

Status: complete for review; no open business decision blocks this app.

App `EMPLOYEE_IMPORT`; owner `employee`; delivery wave HCM-2.

## SCOPE

Let HR create or update workforce records in bulk from a CSV or XLSX file through a versioned template, a side-effect-free preview and an idempotent commit.

Actors: HR Operations (Toby).

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/employee/TECHNICAL-DESIGN.md) and [domain rules](../../domains/employee/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Maintain versioned import templates that map source columns to approved fields.
2. Start a run: choose a published template and intended action, then upload the file.
3. Validate; review per-row status, issues and duplicate matches without changing workforce data.
4. Resolve ambiguous matches, commit, and review per-row results and a safe error report.

<a id="req-employee-import-001"></a>

## REQ-EMPLOYEE-IMPORT-001 — Maintain versioned templates

Define templates with format (CSV or XLSX), header row, date format, time zone and columns mapped to importable standard or custom fields, allow-listed transformations and match-key columns. Publishing makes a template version immutable.

Acceptance: Mapping a non-importable field or an unknown transformation fails; editing a published template requires a new version.

<a id="req-employee-import-002"></a>

## REQ-EMPLOYEE-IMPORT-002 — Start a bounded run

Upload a file up to 5 MiB and 2,000 data rows for a chosen template and intended action (Create, Update or Upsert). The source digest, parser version and template version become immutable when validation starts.

Acceptance: Oversize, spoofed, macro-enabled or encrypted files are rejected; a started run cannot change its file or template.

<a id="req-employee-import-003"></a>

## REQ-EMPLOYEE-IMPORT-003 — Validate without side effects

Validation parses, transforms and checks every row and records issues with safe codes and messages. It computes match status per DEC-HCM2-001: Unique or Ambiguous when existing people match on normalized legal name plus birth date or on work email, None otherwise.

Acceptance: Row counts in workforce tables are unchanged after validation; issue messages never contain source values.

<a id="req-employee-import-004"></a>

## REQ-EMPLOYEE-IMPORT-004 — Resolve matches

Per DEC-HCM2-001, every matched row needs an HR resolution before commit: use the existing person (Update or Upsert), create new with a reason, or skip the row. Automatic merge is forbidden.

Acceptance: A run with any unresolved matched row cannot commit that row; resolutions are recorded per row with the resolving account.

<a id="req-employee-import-005"></a>

## REQ-EMPLOYEE-IMPORT-005 — Commit idempotently

Commit applies each valid row through `WorkforceFactsPort` with a row idempotency key. Committed rows are never replayed; failed rows record a safe failure code. No invitations are created.

Acceptance: Retrying commit after a mid-run failure applies only remaining rows; totals reconcile with row statuses.

<a id="req-employee-import-006"></a>

## REQ-EMPLOYEE-IMPORT-006 — Download a safe issue report

Download a CSV of row numbers, field names, issue codes and severities with no source values. The download is audited as an export.

Acceptance: The report contains no personal values; an export audit event is appended.

<a id="req-employee-import-007"></a>

## REQ-EMPLOYEE-IMPORT-007 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-employee-import-008"></a>

## REQ-EMPLOYEE-IMPORT-008 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

## BUSINESS-DATA

Display: Runs: created time, template and version, intended action, status, total, valid, invalid, committed, failed, skipped. Rows: number, status, match status, proposed action, issue count.

Query behavior: Runs and templates: server mode, sort created time desc then id. Rows: server mode, filters status and matchStatus, sort row number.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Invitations, account creation, background processing of larger files, scheduled imports and job architecture import are outside HCM-2. Planned apps are not implemented through navigation links.
