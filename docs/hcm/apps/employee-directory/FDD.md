# Employee Directory — functional design

Status: complete for review; no open business decision blocks this app.

App `EMPLOYEE_DIRECTORY`; owner `employee`; delivery wave HCM-2.

## SCOPE

Let every worker find colleagues in the current workforce and see organisation-visible contact and placement information.

Actors: All enabled personas with the directory permission (Jim, Michael, Toby, David).

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/employee/TECHNICAL-DESIGN.md) and [domain rules](../../domains/employee/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Search by name, work email or worker number; narrow by unit, department, location or designation.
2. Select a colleague; the mid column shows their organisation-visible details and reporting context.
3. Email a colleague through the work email link, or move to their manager or direct reports.

<a id="req-employee-directory-001"></a>

## REQ-EMPLOYEE-DIRECTORY-001 — Search the current workforce

Search by normalized name (contains), work email and worker number (exact or prefix), with unit, department, location and designation filters and name sorting.

Acceptance: Search never matches hidden fields, personal contacts or identifiers; results are paged and stable under equal names.

<a id="req-employee-directory-002"></a>

## REQ-EMPLOYEE-DIRECTORY-002 — Show only organisation-visible fields

Every field shown or searched has effective Organization visibility at the same instant, after tenant policy and allowed worker preferences.

Acceptance: Narrowing work email to HR removes it from results, detail and search matching on the next request.

<a id="req-employee-directory-003"></a>

## REQ-EMPLOYEE-DIRECTORY-003 — Inspect a colleague

Show display name, designation, department, unit, location, work email link, worker number, manager and direct reports. Concurrent assignments are listed explicitly.

Acceptance: Detail DTO equals the Organization allowlist; the manager link opens that manager’s entry.

<a id="req-employee-directory-004"></a>

## REQ-EMPLOYEE-DIRECTORY-004 — Include the current workforce only

Include workers with an open employment (Active, OnNotice or Suspended) and a current assignment. Exclude Pending and Ended. Employment status itself is not shown.

Acceptance: A future hire and an ended employee never appear; a suspended employee appears without any status indication.

<a id="req-employee-directory-005"></a>

## REQ-EMPLOYEE-DIRECTORY-005 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-employee-directory-006"></a>

## REQ-EMPLOYEE-DIRECTORY-006 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

## BUSINESS-DATA

Display: Results: avatar initials, display name, designation, department, location, work email. Detail: plus unit, worker number, manager, direct reports.

Query behavior: Server mode. q matches normalized name (contains), work email and worker number (prefix); filters unitId, departmentId, locationId, designationId; sort name asc/desc then id. Cursor pages of 25, max 100.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Profile photos, export, printing, personal contacts, org chart rendering and messaging are outside this app. Planned apps are not implemented through navigation links.
