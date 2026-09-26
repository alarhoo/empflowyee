# Lookup Values — functional design

Status: complete for review; no open business decision blocks this app.

App `LOOKUP_VALUES`; owner `workforce-foundation`; delivery wave HCM-2.

## SCOPE

Maintain the tenant-owned workforce lookup sets (worker types, employment end reasons and worker event types) and inspect the product-owned reference lists they sit beside.

Actors: Tenant administrators (David) maintain tenant sets. HR Operations (Toby) read all sets.

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/workforce-foundation/TECHNICAL-DESIGN.md) and [domain rules](../../domains/workforce-foundation/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Open the app; the begin column lists lookup sets with ownership (Product or Tenant) and value counts.
2. Select a set; the mid column shows its values with deep link `/workforce-foundation/lookup-values/:setKey`.
3. For a tenant set, add a value, edit its name, description, order or attributes, or retire and reactivate it.
4. Product sets (gender, marital status, relationship type, country, currency) are read-only.

<a id="req-lookup-values-001"></a>

## REQ-LOOKUP-VALUES-001 — Browse sets and values

List the eight lookup sets and, for a selected set, its values with code, name, description, sort order, active state and set-specific attributes.

Acceptance: Values come from PostgreSQL; retired values remain visible with Inactive status; selection survives reload through the route.

<a id="req-lookup-values-002"></a>

## REQ-LOOKUP-VALUES-002 — Maintain tenant values

Create a value with a unique uppercase code (letters, digits, underscore; 2–40), name (1–100), optional description (≤500), sort order and attributes. Worker types carry statutory class, payroll-eligible and benefit-eligible. End reasons carry voluntary, regrettable default and rehire-eligible default. Worker event types carry a product category. Edits change everything except the code.

Acceptance: Duplicate or malformed codes, unknown attributes and stale revisions fail with field errors; a code cannot change after creation.

<a id="req-lookup-values-003"></a>

## REQ-LOOKUP-VALUES-003 — Retire without losing meaning

Retiring hides a value from new choices but keeps it valid for existing references and history. Reactivation is allowed. There is no delete.

Acceptance: A retired worker type still renders on existing workers and is absent from option endpoints; no DELETE handler or grant exists.

<a id="req-lookup-values-004"></a>

## REQ-LOOKUP-VALUES-004 — Protect product lists

Product sets are read-only for every tenant actor. The worker event type approval flag is display-only and governed by the employment-change approval matrix.

Acceptance: Mutations against product sets return 400 `set-not-editable`; runtime has SELECT only on product tables.

<a id="req-lookup-values-005"></a>

## REQ-LOOKUP-VALUES-005 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.workforce-foundation` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-lookup-values-006"></a>

## REQ-LOOKUP-VALUES-006 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

<a id="req-lookup-values-007"></a>

## REQ-LOOKUP-VALUES-007 — Persist and attribute correctly

Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Acceptance: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

## BUSINESS-DATA

Display: Sets: name, ownership, active value count. Values: code, name, description, sort order, active state, attributes.

Query behavior: Sets are a bounded client collection of eight. Values are server mode: q matches code and name; active filter; sort sortOrder then name then id.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Departments, designations, locations and other structure belong to Organization Structure (DEC-HCM2-014). No bulk import, export or deletion. Planned apps are not implemented through navigation links.
