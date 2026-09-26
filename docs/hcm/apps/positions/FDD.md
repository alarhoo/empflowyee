# Positions — functional design

Status: complete for review; no open business decision blocks this app.

App `POSITIONS`; owner `job-architecture`; delivery wave HCM-2.

## SCOPE

Plan and govern budgeted positions through versioned, previewed and approved change requests, and see their occupancy derived from assignments.

Actors: HR Operations (Toby) request changes. One independent approver holding the approve permission (David in the seed) decides every request. Both read.

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/job-architecture/TECHNICAL-DESIGN.md) and [domain rules](../../domains/job-architecture/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Filter positions by status, placement, profile or vacancy and open one in the mid column.
2. Inspect placement, capacity, current incumbents from assignments, relationships and version history.
3. Request a new position on a dedicated page, or request a change, freeze, reopen, close or cancel from the position.
4. Preview the impact, submit, and track the request in the end column; approvers approve or reject there.

<a id="req-positions-001"></a>

## REQ-POSITIONS-001 — Find and inspect positions

List positions with code, name, lifecycle status, placement, capacity, occupied headcount and FTE, and remaining capacity. Remaining is shown only when occupancy is complete; otherwise _Occupancy unavailable_ is shown.

Acceptance: Occupancy counts effective assignments linked to the position at today; unavailable occupancy is never shown as zero.

<a id="req-positions-002"></a>

## REQ-POSITIONS-002 — Request a new position

Enter code, name, published profile version, allowed grade, designation, legal entity, unit, department, location, type, headcount capacity, FTE capacity, key-position flag, cost centre and effective-from date, then preview and submit.

Acceptance: Grade not allowed by the profile, retired structure, non-positive capacity and duplicate code are rejected before submission.

<a id="req-positions-003"></a>

## REQ-POSITIONS-003 — Request lifecycle changes

Request Change, Freeze, Reopen, Close or Cancel with a reason. The preview shows active assignments, assigned FTE, child positions and downstream references. Closing or freezing never ends an assignment.

Acceptance: A stale or expired preview blocks submission with 409 `preview-stale`; closing a staffed position leaves its assignments unchanged.

<a id="req-positions-004"></a>

## REQ-POSITIONS-004 — Approve or reject under the lifecycle policy

Per DEC-HCM2-008, every request type (Create, Change, Freeze, Reopen, Close, Cancel and requirement changes) needs one approver who is not the requester. A decision binds to the request revision, preview digest and state; applying it publishes the successor version or lifecycle status.

Acceptance: Self-approval, duplicate decisions and decisions on changed requests are rejected; approval and application are atomic.

<a id="req-positions-005"></a>

## REQ-POSITIONS-005 — Enforce capacity policy

Per DEC-HCM2-007, partial FTE assignments are allowed. An assignment is rejected if it would exceed the headcount capacity or the FTE capacity. There is no overfill. When occupancy is incomplete the check fails safely.

Acceptance: An assignment that would take headcount or FTE above capacity returns 409 `capacity-exceeded`; incomplete occupancy returns 409 `occupancy-unknown`; neither changes any fact.

<a id="req-positions-006"></a>

## REQ-POSITIONS-006 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.job-architecture` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-positions-007"></a>

## REQ-POSITIONS-007 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

<a id="req-positions-008"></a>

## REQ-POSITIONS-008 — Persist and attribute correctly

Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Acceptance: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

## BUSINESS-DATA

Display: Code; name; lifecycle status; unit; department; location; profile; grade; headcount and FTE capacity; occupied; remaining; open request.

Query behavior: Server mode. q matches code and name; filters status, unitId, departmentId, locationId, profileId, hasVacancy; sort code or name, then id.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Position import, budgeting amounts, compensation, recruitment requisitions and hierarchy visualization are outside HCM-2. Planned apps are not implemented through navigation links.
