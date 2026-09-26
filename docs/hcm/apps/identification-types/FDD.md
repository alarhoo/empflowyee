# Identification Types — functional design

Status: complete for review; no open business decision blocks this app.

App `IDENTIFICATION_TYPES`; owner `workforce-foundation`; delivery wave HCM-2.

## SCOPE

Let tenant administrators and HR inspect the product-maintained identification-type catalogue that later statutory and duplicate-detection work relies on. Tenants view the catalogue only (DEC-HCM2-016).

Actors: Tenant administrators (David) and HR Operations (Toby) read. No tenant actor can change the catalogue.

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/workforce-foundation/TECHNICAL-DESIGN.md) and [domain rules](../../domains/workforce-foundation/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Open the app from Administration. The server resolves permission and entitlement before loading data.
2. Filter the bounded catalogue by country and active state, or search by code or name.
3. Read each type’s uniqueness, masking and payroll-requirement characteristics.

<a id="req-identification-types-001"></a>

## REQ-IDENTIFICATION-TYPES-001 — Browse the catalogue

List every product identification type with code, name, issuing country or _All countries_, unique-per-person, requires-masking, required-for-payroll and active state.

Acceptance: Rows come from the global product table; retired types show Inactive; the validation expression is described in words and never returned raw.

<a id="req-identification-types-002"></a>

## REQ-IDENTIFICATION-TYPES-002 — Keep the catalogue product-owned

Per DEC-HCM2-016, tenants view the catalogue only. New or changed types arrive as product updates through migrations. No tenant manage endpoint, permission or control exists.

Acceptance: Mutation methods have no handler; runtime has SELECT only on `identification_type`; no mutation control renders for any persona.

<a id="req-identification-types-003"></a>

## REQ-IDENTIFICATION-TYPES-003 — Keep identifier values out

The app never shows, stores, counts or exports any person’s identification value.

Acceptance: DTO allowlist contains no value, hash, count or person reference; SQL reads only `identification_type` and `country`.

<a id="req-identification-types-004"></a>

## REQ-IDENTIFICATION-TYPES-004 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.workforce-foundation` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-identification-types-005"></a>

## REQ-IDENTIFICATION-TYPES-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

## BUSINESS-DATA

Display: Code; name; issuing country; unique per person; requires masking; required for payroll; active state.

Query behavior: Client mode over the bounded product catalogue (maximum 500 rows). Search matches code and name; filters country and active; sort name then code.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Identification values, verification, reveal, duplicate hashing and statutory workflows belong to later statutory work under the field-encryption ADR. No tenant-defined types unless DEC-HCM2-016 allows them. Planned apps are not implemented through navigation links.
