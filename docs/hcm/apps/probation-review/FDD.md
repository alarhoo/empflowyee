# Probation Review — functional design

Status: complete for review; no open business decision blocks this app.

App `PROBATION_REVIEW`; owner `employee`; delivery wave HCM-2.

## SCOPE

Let an assigned reviewer assess a worker’s probation and recommend an outcome to HR.

Actors: Assigned reviewers holding the review permission (Michael in the seed).

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/employee/TECHNICAL-DESIGN.md) and [domain rules](../../domains/employee/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Open the app; the begin column lists reviews assigned to the actor.
2. Open a review to see minimal employee context and previous decisions.
3. Complete the assessment on its own page and submit it.
4. Resubmit before HR decides if needed; the assessment locks after the decision.

<a id="req-probation-review-001"></a>

## REQ-PROBATION-REVIEW-001 — See my assigned reviews

List reviews whose stored reviewer is the verified account, with due date and status.

Acceptance: Being the worker’s manager without being the stored reviewer shows nothing; reassignment removes access on the next request.

<a id="req-probation-review-002"></a>

## REQ-PROBATION-REVIEW-002 — Submit an assessment

Submit a recommendation (Confirm, Extend, Fail, NoChange), an overall rating from 1 to 5 (DEC-HCM2-003), strengths, concerns and a recommendation reason.

Acceptance: Ratings outside 1–5 or non-integers and missing reasons are rejected; HR is notified on submission.

<a id="req-probation-review-003"></a>

## REQ-PROBATION-REVIEW-003 — Supersede before decision

A new submission supersedes the previous assessment while the review is undecided. After the HR decision, assessments are read-only.

Acceptance: Superseded assessments stay in history; submission after decision returns 409.

<a id="req-probation-review-004"></a>

## REQ-PROBATION-REVIEW-004 — Show minimal context

Show only name, designation, unit, hire date, probation period and previous decisions. No personal data.

Acceptance: The reviewer DTO contains no personal, contact or family fields.

<a id="req-probation-review-005"></a>

## REQ-PROBATION-REVIEW-005 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

## BUSINESS-DATA

Display: Reviews: worker, review type, due date, status. Detail: context, current assessment, history.

Query behavior: Server mode, own assigned reviews; filter status; sort due date then id.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

HR decisions, scheduling and reviewer assignment belong to Probation Management. Planned apps are not implemented through navigation links.
