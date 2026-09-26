# Organization Structure — functional design

Status: complete for review; no open business decision blocks this app. Added by DEC-HCM2-014; the app enters the canonical catalogue through the [admission slice](../../roadmap/HCM-2-DESIGN-REVIEW.md#catalogue-admission).

App `ORGANIZATION_STRUCTURE`; owner `workforce-foundation`; delivery wave HCM-2.

## SCOPE

Maintain the HCM-owned organisation structure that workers and positions are placed in: organisation HR defaults, legal entities, unit types, effective-dated organisation units, departments, designations and work locations (DEC-HCM2-014).

Actors: Tenant administrators (David) maintain structure. HR Operations (Toby) read.

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/workforce-foundation/TECHNICAL-DESIGN.md) and [domain rules](../../domains/workforce-foundation/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Choose a structure area in the begin column: Organisation, Legal entities, Unit types, Units, Departments, Designations or Locations.
2. Browse the area’s items in the mid column; units show as a tree at a chosen as-of date.
3. Open an item in the end column to see its details, versions and where it is used.
4. Create or change items; unit changes take effect from a date and keep history.

<a id="req-organization-structure-001"></a>

## REQ-ORGANIZATION-STRUCTURE-001 — Browse structure

List each area’s items with code, name, active state and key attributes. Units display as a hierarchy at an as-of date, defaulting to today in the organisation time zone.

Acceptance: Future and closed unit versions are excluded at the chosen date; retired items remain visible with Inactive status.

<a id="req-organization-structure-002"></a>

## REQ-ORGANIZATION-STRUCTURE-002 — Maintain organisation HR defaults

Edit the organisation profile: default time zone (IANA), default language (BCP 47), default currency, financial-year start month and day, and headquarters location. The organisation display name stays the Account-owned tenant name.

Acceptance: Invalid time zones, day 31 for a 30-day month and inactive locations are rejected; the display name has no edit control.

<a id="req-organization-structure-003"></a>

## REQ-ORGANIZATION-STRUCTURE-003 — Maintain legal entities

Create and edit legal entities with code, name, registered name, entity type, country, statutory employer identifiers, registered location, reporting currency, financial-year start and incorporation and operations dates. A legal entity closes by setting its operations-closed date.

Acceptance: Codes are unique per tenant and immutable; closing an entity with open employments returns 409 `structure-in-use`; there is no delete.

<a id="req-organization-structure-004"></a>

## REQ-ORGANIZATION-STRUCTURE-004 — Maintain unit types

Define the unit type chain (parent type), whether a level bears a legal entity, whether several units may share a parent, display names and enablement.

Acceptance: Type-chain cycles are rejected; disabling a type hides it from new units but keeps existing units valid.

<a id="req-organization-structure-005"></a>

## REQ-ORGANIZATION-STRUCTURE-005 — Maintain effective-dated units

Create a unit with its first version (type, parent, name, legal entity on bearing levels, primary location, cost centre, head worker, effective-from). Change name or placement by adding a version from a date. Retire a unit from a date, optionally naming a successor.

Acceptance: Overlapping versions, cycles, a parent type outside the chain and retiring a unit with current or future assignments or positions are rejected; path and depth stay consistent after reparenting.

<a id="req-organization-structure-006"></a>

## REQ-ORGANIZATION-STRUCTURE-006 — Maintain departments, designations and locations

Create, edit, retire and reactivate departments (parent, head, cost centre, target headcount), designations (title only, display order) and locations (type, address, time zone, virtual flag, geofence fields).

Acceptance: A designation carries no grade or authorization meaning; retiring an item referenced by a current assignment or position returns 409 `structure-in-use`.

<a id="req-organization-structure-007"></a>

## REQ-ORGANIZATION-STRUCTURE-007 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.workforce-foundation` and tenant scope. Browser visibility never authorizes an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor and foreign tenant fail with 403 or 404 and no data leakage.

<a id="req-organization-structure-008"></a>

## REQ-ORGANIZATION-STRUCTURE-008 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry and dirty-leave confirmation behave as specified.

<a id="req-organization-structure-009"></a>

## REQ-ORGANIZATION-STRUCTURE-009 — Persist and attribute correctly

Commands persist state, revision, audit event and idempotency receipt in one transaction. Unit versions are never rewritten; changes close the previous version.

Acceptance: PostgreSQL exclusion constraints and RLS hold under failure injection; replay with the same key returns the first response.

## BUSINESS-DATA

Display: Per area: code, name, active state and key attributes. Units: tree of name, type and legal entity; detail with versions and usage counts.

Query behavior: Units: tree children paged by 100 per parent at `asOf`. Other areas: server mode, q matches code and name, active filter, sort name then id. Legal entities and unit types are bounded client lists (maximum 200).

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

GST and other tax registrations, Account provisioning handoff, bulk structure import, reorganisation planning and historical comparison views are outside HCM-2. Planned apps are not implemented through navigation links.
