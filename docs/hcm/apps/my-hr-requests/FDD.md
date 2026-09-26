# My HR Requests — functional design

Status: complete for review; no open business decision blocks this app.

App `MY_HR_REQUESTS`; owner `employee`; delivery wave HCM-2.

## SCOPE

Let every worker raise HR service requests, converse with HR and track them, seeing only employee-visible content.

Actors: Every enabled persona with a linked worker, own requests only.

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/employee/TECHNICAL-DESIGN.md) and [domain rules](../../domains/employee/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Open the app; the begin column lists the actor’s open and closed requests.
2. Raise a request: choose a type, enter a subject and description, optionally attach a file.
3. Open a request to read HR replies and respond.
4. Cancel an open request, or reopen a resolved one within the approved window.

<a id="req-my-hr-requests-001"></a>

## REQ-MY-HR-REQUESTS-001 — Raise a request

Choose a request type available to the actor’s audience, enter subject and description, and optionally attach one file. The description becomes the first message.

Acceptance: Types outside the actor’s audience or entitlement are not offered and are rejected server-side; the request number is returned.

<a id="req-my-hr-requests-002"></a>

## REQ-MY-HR-REQUESTS-002 — Converse with HR

Read employee-visible messages and attachments and reply while the request is not Closed or Cancelled.

Acceptance: Internal notes, internal attachments, assignee identity and internal SLA fields never appear.

<a id="req-my-hr-requests-003"></a>

## REQ-MY-HR-REQUESTS-003 — Cancel and reopen

Cancel a New or Open request with a reason. Reopen a Resolved request within 7 days of resolution (DEC-HCM2-004).

Acceptance: Reopen on day 8 returns 409; Closed and Cancelled requests are read-only.

<a id="req-my-hr-requests-004"></a>

## REQ-MY-HR-REQUESTS-004 — Accept prefilled correction requests

A link from My Profile opens the create dialog with the personal-data correction type and the field name prefilled; the actor still reviews and submits.

Acceptance: The prefill never submits automatically and never includes the current personal value.

<a id="req-my-hr-requests-005"></a>

## REQ-MY-HR-REQUESTS-005 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-my-hr-requests-006"></a>

## REQ-MY-HR-REQUESTS-006 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

<a id="req-my-hr-requests-007"></a>

## REQ-MY-HR-REQUESTS-007 — Persist and attribute correctly

Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Acceptance: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

## BUSINESS-DATA

Display: Requests: number, subject, type, status, last update. Detail: conversation, details, attachments.

Query behavior: Server mode, own requests; view open or closed; q matches number and subject; sort last update desc then id.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Requests on behalf of others, internal content, SLA internals and external channels are outside this app. Planned apps are not implemented through navigation links.
