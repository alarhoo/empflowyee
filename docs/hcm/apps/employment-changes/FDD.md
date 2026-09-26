# Employment Changes — functional design

Status: complete for review; no open business decision blocks this app.

App `EMPLOYMENT_CHANGES`; owner `employee`; delivery wave HCM-2.

## SCOPE

Change employment and assignment facts through explicit, effective-dated, approved requests instead of direct edits.

Actors: HR Operations (Toby) request and apply. One independent approver holding the approve permission (David in the seed) decides. Both read.

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/employee/TECHNICAL-DESIGN.md) and [domain rules](../../domains/employee/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Start a request: choose the worker and context, the change type, the target facts and the effective date.
2. Review current and proposed facts side by side and submit.
3. Approvers approve or reject each required slot with a reason.
4. Approved changes execute immediately when allowed, or HR applies them on or after the effective date.

<a id="req-employment-changes-001"></a>

## REQ-EMPLOYMENT-CHANGES-001 — Request a typed change

Support Rehire, Transfer, Promotion, Demotion, LocationChange, ManagerChange, HoursChange, EmploymentTypeChange, Suspension, ReturnToWork and Correction, each with its own target fields, including a target position. The server validates against current facts.

Acceptance: Invalid targets for the type, retired structure, a second nonterminal request overlapping the same employment and date, and a stale expected revision are rejected.

<a id="req-employment-changes-002"></a>

## REQ-EMPLOYMENT-CHANGES-002 — Approve under the matrix

Per DEC-HCM2-002, every change type has one approval slot filled by an approver who is not the requester. The effective date may be at most 30 days before submission, or 90 days for Correction. Future dates are allowed.

Acceptance: Self-approval returns 403 `self-approval-forbidden`; a date 31 days back (91 for Correction) returns 400 `effective-date-out-of-range`.

<a id="req-employment-changes-003"></a>

## REQ-EMPLOYMENT-CHANGES-003 — Execute without overlap

Execution closes and opens dated rows, updates reporting lines, checks position capacity (reject beyond headcount or FTE capacity, per DEC-HCM2-007) and records one worker event per employment. Employment-level facts apply only on or after the effective date.

Acceptance: Any failing step rolls back all steps; exclusion constraints hold; future-dated employment-level changes stay Approved until Apply.

<a id="req-employment-changes-004"></a>

## REQ-EMPLOYMENT-CHANGES-004 — Rehire and correct explicitly

Rehire creates a new employment for an existing worker with the next sequence number and shows rehire eligibility. Correction changes a dated row or establishes an incomplete record with a reason and a correction event.

Acceptance: Rehire never creates a second person or worker; a correction keeps the replaced row in history.

<a id="req-employment-changes-005"></a>

## REQ-EMPLOYMENT-CHANGES-005 — Track and cancel

Requests show status, approvals and execution steps. The requester can cancel a request that is Draft, PendingApproval or Approved but not executed.

Acceptance: Cancelled and rejected requests change no workforce fact.

<a id="req-employment-changes-006"></a>

## REQ-EMPLOYMENT-CHANGES-006 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-employment-changes-007"></a>

## REQ-EMPLOYMENT-CHANGES-007 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

<a id="req-employment-changes-008"></a>

## REQ-EMPLOYMENT-CHANGES-008 — Persist and attribute correctly

Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Acceptance: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

## BUSINESS-DATA

Display: Requests: worker, change type, effective date, status, current slot, requester, created time. Detail: current versus proposed facts, approvals, execution steps, history.

Query behavior: Server mode. View all, mine or awaiting my decision; filters changeType, status, effective date range; sort effective date or created time, then id.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Terminations and exits (offboarding), compensation changes, automatic scheduled execution and bulk changes are outside HCM-2. Planned apps are not implemented through navigation links.
