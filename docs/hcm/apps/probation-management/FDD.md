# Probation Management — functional design

Status: complete for review; no open business decision blocks this app.

App `PROBATION_MANAGEMENT`; owner `employee`; delivery wave HCM-2.

## SCOPE

Let HR run probation: schedule reviews, assign reviewers, and record decisions that update employment probation facts.

Actors: HR Operations (Toby).

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/employee/TECHNICAL-DESIGN.md) and [domain rules](../../domains/employee/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. See probation cases and reviews that are due soon or overdue.
2. Schedule a review from the default schedule and assign an explicit reviewer.
3. Read the reviewer’s assessment and record the HR decision.
4. An extension moves the end date and creates the next review; failure never ends employment.

<a id="req-probation-management-001"></a>

## REQ-PROBATION-MANAGEMENT-001 — Track probation cases

List employments in probation (InProgress or Extended) with end date, next review and overdue state computed server-side in the organisation time zone.

Acceptance: Confirmed and NotApplicable employments are excluded; overdue matches the server calculation.

<a id="req-probation-management-002"></a>

## REQ-PROBATION-MANAGEMENT-002 — Schedule the final review and assign a reviewer

Per DEC-HCM2-003, when an employment enters probation the Employee domain creates one Final review due 14 days before the probation end date, in the same transaction. HR assigns an explicit reviewer account, optionally prefilled with the current manager; the stored reviewer is the authority. HR may also schedule an ad-hoc review.

Acceptance: Creating a worker with a probation end date creates exactly one Final review without a reviewer; assigning the reviewer notifies them; reassignment removes the prior reviewer’s access.

<a id="req-probation-management-003"></a>

## REQ-PROBATION-MANAGEMENT-003 — Record the HR decision

Record Confirm, Extend, Fail or NoChange with an effective date and reason, separate from the assessment. Confirm and Extend update employment probation facts through the workforce port. Per DEC-HCM2-003, at most one extension is allowed, ending no more than 90 days after the original end date, and it creates the next Final review due 14 days before the new end.

Acceptance: A second extension or one beyond 90 days is rejected; Fail does not end employment or create an exit; the prior decision is preserved after an extension.

<a id="req-probation-management-004"></a>

## REQ-PROBATION-MANAGEMENT-004 — Show escalated reviews

Per DEC-HCM2-003, a review still undecided 7 days after its due date is Escalated to its owning HR account. HCM-2 computes this state at read time and shows it in HR views. The escalation notification needs a background runtime and is deferred.

Acceptance: A review 8 days past due shows Escalated for Toby; no notification is fabricated.

<a id="req-probation-management-005"></a>

## REQ-PROBATION-MANAGEMENT-005 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-probation-management-006"></a>

## REQ-PROBATION-MANAGEMENT-006 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

<a id="req-probation-management-007"></a>

## REQ-PROBATION-MANAGEMENT-007 — Persist and attribute correctly

Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Acceptance: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

## BUSINESS-DATA

Display: Cases: worker, designation, hire date, probation end date, status, next review due, overdue. Review: type, period, due date, status, reviewer, assessments, decision.

Query behavior: Server mode. Views due soon, overdue, all; filters status, reviewType, unitId; sort due date then id.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Performance reviews, termination, compensation effects and external email are outside this app. Planned apps are not implemented through navigation links.
