# Org Chart — functional design

Status: complete for review; no open business decision blocks this app.

App `ORG_CHART`; owner `workforce-foundation`; delivery wave HCM-2.

## SCOPE

Let every worker explore the current reporting structure and see who works where, using only organisation-visible information.

Actors: All enabled personas with the org chart permission (Jim, Michael, Toby, David).

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/workforce-foundation/TECHNICAL-DESIGN.md) and [domain rules](../../domains/workforce-foundation/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Open the chart; the begin column shows root nodes: current primary assignments without a current primary solid manager line.
2. Expand a node to load its direct reports in pages; or search by name or worker number to reveal a person’s path from the root.
3. Select a node; the mid column shows the person’s organisation-visible details and direct reports, deep-linked by assignment.
4. Follow the manager link or a direct report to move through the chart.

<a id="req-org-chart-001"></a>

## REQ-ORG-CHART-001 — Explore the hierarchy

Build the hierarchy from current primary solid reporting lines as of today in the organisation time zone. Children load in pages of 50 sorted by display name with a _Load more_ item.

Acceptance: Multiple roots render; closed and future lines are excluded; a manager with 120 reports needs three bounded requests; no request loads the whole tenant.

<a id="req-org-chart-002"></a>

## REQ-ORG-CHART-002 — Find a person

Search by normalized name (minimum two characters) or worker number prefix. Selecting a result loads its ancestor path (bounded to 50 levels), expands it and selects the node.

Acceptance: Search never matches personal email, identifiers or hidden fields; a reporting cycle in data is reported as a safe error, not an infinite loop.

<a id="req-org-chart-003"></a>

## REQ-ORG-CHART-003 — Inspect a node

Show display name, designation, organisation unit, department, location, work email and manager when their effective visibility is Organization, plus direct reports. Concurrent assignments appear as separate nodes labelled with their legal entity or unit.

Acceptance: A tenant policy narrowing work email removes it from the DTO and UI; a person with two primary assignments shows two labelled nodes.

<a id="req-org-chart-004"></a>

## REQ-ORG-CHART-004 — Remain informational

The chart grants no access and enables no action. Links to other apps appear only when those apps are discoverable, and destinations re-authorize.

Acceptance: Being someone’s manager in the chart does not change any other API response; Pending and Ended employments never appear.

<a id="req-org-chart-005"></a>

## REQ-ORG-CHART-005 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.workforce-foundation` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-org-chart-006"></a>

## REQ-ORG-CHART-006 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

## BUSINESS-DATA

Display: Node: avatar initials, display name, designation, unit, direct report count. Detail: plus department, location, work email, manager, direct reports table.

Query behavior: Children and roots: cursor pages of 50, sorted display name then assignment ID. Search: q ≥ 2 characters over `search_text` and worker number prefix; 25 per page.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Dotted, temporary and administrative lines, historical as-of views, position hierarchy, editing, export and printing are outside HCM-2. Planned apps are not implemented through navigation links.
