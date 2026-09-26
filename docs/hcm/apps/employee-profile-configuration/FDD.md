# Employee Profile Configuration — functional design

Status: complete for review; no open business decision blocks this app.

App `EMPLOYEE_PROFILE_CONFIGURATION`; owner `employee`; delivery wave HCM-2.

## SCOPE

Let HR narrow the product profile field policy for the tenant and define tenant custom fields, without ever widening product privacy ceilings.

Actors: HR Operations (Toby) manage. Tenant administrators (David) read.

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/employee/TECHNICAL-DESIGN.md) and [domain rules](../../domains/employee/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Choose Standard fields or Custom fields; filter by section and sensitivity.
2. Open a field to see its product ceiling, product default and the tenant policy per context.
3. Narrow the tenant policy in a dialog, or reset it to the product default.
4. Create a custom field on its own page, maintain its options and retire it when no longer needed.

<a id="req-employee-profile-configuration-001"></a>

## REQ-EMPLOYEE-PROFILE-CONFIGURATION-001 — Inspect standard fields

List product standard fields with section, sensitivity, maximum visibility, searchability and product default requiredness, visibility and self-edit mode.

Acceptance: Values match the migrated product catalogue derived from the profile field policy; unlisted fields show the restrictive default.

<a id="req-employee-profile-configuration-002"></a>

## REQ-EMPLOYEE-PROFILE-CONFIGURATION-002 — Narrow tenant policy

For the WorkforceActivation context and ordinary display, set requiredness, visibility (never above the ceiling), self-edit mode (never more permissive than the product default) and whether worker preferences are allowed.

Acceptance: A widening attempt returns 400 `visibility-ceiling-exceeded`; reset returns to the product default; the change affects the next read of every consuming app.

<a id="req-employee-profile-configuration-003"></a>

## REQ-EMPLOYEE-PROFILE-CONFIGURATION-003 — Define custom fields

Create a custom field with code, name, description, owner scope (Person, Worker, Employment or Assignment), data type, sensitivity, section and searchable-when-visible (DirectorySafe only). Select types have options.

Acceptance: Owner scope and data type cannot change after the first stored value; option codes are unique per field.

<a id="req-employee-profile-configuration-004"></a>

## REQ-EMPLOYEE-PROFILE-CONFIGURATION-004 — Retire fields and options

Retire a custom field or option to stop new values while keeping existing values and history.

Acceptance: Retired fields disappear from edit forms and remain readable to authorized viewers; no delete exists.

<a id="req-employee-profile-configuration-005"></a>

## REQ-EMPLOYEE-PROFILE-CONFIGURATION-005 — Preview effective visibility

For a selected field, show the effective visibility and edit mode for Self, Manager, HR and Organization viewers using the same evaluator the APIs use.

Acceptance: The preview matches actual DTO serialization for the four seeded personas.

<a id="req-employee-profile-configuration-006"></a>

## REQ-EMPLOYEE-PROFILE-CONFIGURATION-006 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-employee-profile-configuration-007"></a>

## REQ-EMPLOYEE-PROFILE-CONFIGURATION-007 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

<a id="req-employee-profile-configuration-008"></a>

## REQ-EMPLOYEE-PROFILE-CONFIGURATION-008 — Persist and attribute correctly

Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Acceptance: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

## BUSINESS-DATA

Display: Field code; name; section; sensitivity; ceiling; product default; tenant policy; custom flag; active.

Query behavior: Client mode over a bounded catalogue (maximum 500 standard plus custom fields). Search code and name; filters scope, section, sensitivity; sort section then sort order.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Verification channels, custom field formulas, cross-field rules and field-level import mapping (owned by Employee Import) are outside this app. Planned apps are not implemented through navigation links.
