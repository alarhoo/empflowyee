# My Profile — functional design

Status: complete for review; no open business decision blocks this app.

App `MY_PROFILE`; owner `employee`; delivery wave HCM-2.

## SCOPE

Let every worker see their own profile and maintain the personal information they are allowed to edit directly.

Actors: Every enabled persona with a linked worker, own record only.

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/employee/TECHNICAL-DESIGN.md) and [domain rules](../../domains/employee/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Open My Profile; the server resolves the worker from the verified account.
2. Open Personal by default; read grouped basic details, office information, contacts,
   emergency contacts, addresses, family and additional information. Employment and
   Privacy have separate tabs.
3. Select Edit profile to reveal directly editable items, then use focused dialogs;
   each save is immediate and audited. Done editing restores the read view.
4. For fields that need HR, use Request correction once My HR Requests is available.

<a id="req-my-profile-001"></a>

## REQ-MY-PROFILE-001 — Read my profile

Show every field whose effective visibility includes Self, grouped by section. The
read view shows values without maintenance-mode labels or personal mutation controls.
Edit profile reveals supported controls and maintenance-mode explanations. Concurrent
employments are shown separately in Employment. The identity header shows initials,
display name, designation and department, with employee ID, status, manager, location
and legal entity where visible. Header facts use the primary employment and assignment.

Acceptance: The DTO equals the Self allowlist; an account without a linked worker sees an explanatory empty state, not an error.

<a id="req-my-profile-002"></a>

## REQ-MY-PROFILE-002 — Edit directly editable information

Edit preferred name, blood group, personal email and mobile (saved as not verified), emergency contacts and dependants, and Direct custom fields.

Acceptance: Emergency priority is unique per person; dependants are allowed only for relationship types eligible as dependants; fields in other modes reject edits with `field-not-editable`.

Email and phone editors enforce the type, length and format bounds in
[Contact input validation](TDD.md#contact-input-validation). Invalid input shows
field-level feedback on blur or attempted save and sends no command. Correcting
the value clears the error; changing contact type revalidates it. The API applies
the same rules. A relationship phone is optional unless it is an emergency contact.

<a id="req-my-profile-003"></a>

## REQ-MY-PROFILE-003 — Request corrections through HR

ServiceRequest fields (legal names, birth date, gender, marital status, nationality, addresses) show Request correction, which opens a prefilled HR request. The action appears only when My HR Requests is implemented and discoverable.

Acceptance: Before My HR Requests ships, no correction control appears and no request is fabricated.

<a id="req-my-profile-004"></a>

## REQ-MY-PROFILE-004 — Choose visibility preferences

Where a field allows worker preferences, narrow its organisation visibility, or use an allowed opt-in. Preferences never widen beyond tenant policy.

Acceptance: A narrowed work email disappears from the directory for other viewers on the next request.

<a id="req-my-profile-005"></a>

## REQ-MY-PROFILE-005 — Read employment facts

Show legal entity, unit, department, designation, location, manager, employment type, status, service dates and probation facts read-only.

Acceptance: No edit control exists for these fields; they reflect the latest committed workforce facts.

<a id="req-my-profile-006"></a>

## REQ-MY-PROFILE-006 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-my-profile-007"></a>

## REQ-MY-PROFILE-007 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

<a id="req-my-profile-008"></a>

## REQ-MY-PROFILE-008 — Persist and attribute correctly

Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Acceptance: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

## BUSINESS-DATA

Display: Tabs: Personal; Employment; Privacy (when visibility choices are available).
Personal groups: Basic details (Personal information and Office); Contact (Contact
details and Emergency contacts); Addresses; Family and dependants; Additional
information (when defined). There is no separate Overview tab. Only the active tab's
content is mounted. Emergency-only relationships appear under Contact; relationships
that are also dependants appear in Family and dependants too. Editing provides one
combined Emergency contacts and family collection to maintain both categories.

Editing is a set of focused, independently saved commands. It does not promise an
atomic page-wide save or discard changes already saved in a dialog. Changing tabs
returns Personal to read mode; open dialogs retain their existing dirty-draft guard.

Query behavior: Singleton profile read. Emergency contacts and dependants are a bounded client collection (maximum 20).

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Photo, skills, education, work experience, languages, certifications, statutory nominees, identification values and contact verification are outside HCM-2. Planned apps are not implemented through navigation links.
