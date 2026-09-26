# Team Directory — functional design

Status: complete for review; no open business decision blocks this app.

App `TEAM_DIRECTORY`; owner `employee`; delivery wave HCM-2.

## SCOPE

Give managers a view of the workers in their approved team scope with the employment information managers are allowed to see.

Actors: Managers (Michael) holding the team permission.

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/employee/TECHNICAL-DESIGN.md) and [domain rules](../../domains/employee/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Open the app; the begin column lists team members in the approved scope.
2. Filter by location or probation state and select a member.
3. Read the member’s placement, employment and probation facts, and follow links to permitted apps.

<a id="req-team-directory-001"></a>

## REQ-TEAM-DIRECTORY-001 — See my team

List the workers in the actor’s team as of today. Per DEC-HCM2-015, the team is the actor’s direct reports: workers with an assignment whose current primary solid reporting line points to one of the actor’s current assignments. Dotted, temporary and indirect reports are excluded.

Acceptance: Michael sees Jim, Dwight and Pam only; an indirect report or dotted-line report never appears; a worker whose line moves elsewhere disappears on the next request.

<a id="req-team-directory-002"></a>

## REQ-TEAM-DIRECTORY-002 — Show manager-visible fields only

Show fields whose effective visibility includes Manager: placement, employment type, status, service dates, FTE, hours and probation facts. No personal or sensitive data.

Acceptance: DTOs contain no birth date, address, personal contact, family or identifier fields for any member.

<a id="req-team-directory-003"></a>

## REQ-TEAM-DIRECTORY-003 — Require the explicit team permission

A reporting relationship selects subjects only for an actor who holds the team permission; it grants nothing by itself.

Acceptance: Removing Michael’s team grant denies the next request although his reporting lines are unchanged.

<a id="req-team-directory-004"></a>

## REQ-TEAM-DIRECTORY-004 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

## BUSINESS-DATA

Display: Members: avatar, name, designation, location, employment status, probation status. Detail: placement, employment facts, probation facts, work email.

Query behavior: Server mode, 25 per page. q matches name; filters locationId, probationStatus; sort name then id.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Performance, leave, compensation and personal data are outside this app. No actions change workforce facts. Planned apps are not implemented through navigation links.
