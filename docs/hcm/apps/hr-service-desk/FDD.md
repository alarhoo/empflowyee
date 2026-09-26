# HR Service Desk — functional design

Status: complete for review; no open business decision blocks this app.

App `HR_SERVICE_DESK`; owner `employee`; delivery wave HCM-2.

## SCOPE

Let HR agents work employee service requests with separate employee-visible and internal content, routing to teams and policy-driven service levels.

Actors: HR agents (Toby) handle requests; HR service configuration by holders of the configure permission (Toby).

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/employee/TECHNICAL-DESIGN.md) and [domain rules](../../domains/employee/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Work the queue: assigned to me, my teams, or all accessible requests, with SLA state.
2. Open a request; read the conversation and details; reply or add an internal note.
3. Assign or reassign, move status, resolve with a code, or close.
4. Configure teams, memberships, request types and service level policies.

<a id="req-hr-service-desk-001"></a>

## REQ-HR-SERVICE-DESK-001 — Work the queue

List accessible requests by view, with filters for status, priority, type and SLA state, sorted by due time.

Acceptance: Queue order follows the earliest running SLA target; team views show only requests routed to the actor’s teams.

<a id="req-hr-service-desk-002"></a>

## REQ-HR-SERVICE-DESK-002 — Respond with explicit visibility

Replies are employee-visible and notify the requester; internal notes and internal attachments are never visible to employees.

Acceptance: Self endpoints, notifications and search never contain internal content.

<a id="req-hr-service-desk-003"></a>

## REQ-HR-SERVICE-DESK-003 — Assign and route

Assign or reassign to a team and agent with a reason. Team membership routes work but does not authorize access.

Acceptance: Removing a membership changes routing only; access still depends on the handle permission.

<a id="req-hr-service-desk-004"></a>

## REQ-HR-SERVICE-DESK-004 — Move through the lifecycle

New, Open, WaitingForEmployee, WaitingForHr, Resolved with a resolution code, Closed, Cancelled. Per DEC-HCM2-004, the requester may reopen a Resolved request within 7 days of resolution; after that HR closes it.

Acceptance: Invalid transitions return 409; every transition is audited and emitted to the requester when employee-visible.

<a id="req-hr-service-desk-005"></a>

## REQ-HR-SERVICE-DESK-005 — Measure service levels

Per DEC-HCM2-004, targets run on a 24x7 calendar clock. First response and resolution targets are P1 4 hours and 1 day, P2 1 and 3 days, P3 2 and 5 days, P4 3 and 10 days. Clocks pause while waiting for the employee. No next-response target is used in HCM-2.

Acceptance: Due times, pauses, met and breached states match server calculations; a breach is derived when due time passes without the target being met, and persisted on the next write.

<a id="req-hr-service-desk-006"></a>

## REQ-HR-SERVICE-DESK-006 — Configure the service

Maintain teams, memberships, request types (category, audience, classification, default team, service level) and versioned service level policies.

Acceptance: Published policy versions are immutable; changes apply to new requests only.

<a id="req-hr-service-desk-007"></a>

## REQ-HR-SERVICE-DESK-007 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-hr-service-desk-008"></a>

## REQ-HR-SERVICE-DESK-008 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

## BUSINESS-DATA

Display: Queue: request number, subject, type, requester, priority, status, assignee, next due time and SLA state. Detail: conversation, details, SLA targets, assignment history, attachments.

Query behavior: Server mode. Views assigned, teams, all; filters status, priority, typeId, slaState; q matches request number and subject; sort next due then id.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Email or chat channels, knowledge base, surveys, automatic fulfilment of module-owned work and business-hour calendars from Holiday Calendars are outside HCM-2 unless DEC-HCM2-004 requires them. Planned apps are not implemented through navigation links.
