# Position Requirements — functional design

Status: complete for review; no open business decision blocks this app.

App `POSITION_REQUIREMENTS`; owner `job-architecture`; delivery wave HCM-2.

## SCOPE

Specialize a position’s requirements relative to its job profile through governed Add, Replace, Strengthen and Waive variances.

Actors: HR Operations (Toby) propose variances. Requests containing a Waive are approved by an independent approver who also holds the waive permission (David in the seed). Both read.

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/job-architecture/TECHNICAL-DESIGN.md) and [domain rules](../../domains/job-architecture/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Select a position; the mid column shows its effective requirements with their source.
2. Propose variances in a draft requirement change; a Waive needs a justification.
3. Preview the impact and submit; the change travels through the position change request approval.
4. After approval the effective requirement set changes from the approved effective date.

<a id="req-position-requirements-001"></a>

## REQ-POSITION-REQUIREMENTS-001 — Inspect effective requirements

Show the effective requirement set at today: profile requirements with applied position variances, each labelled Profile or Position and showing any variance.

Acceptance: A waived requirement still shows its source and a Waived status; the list matches the published position version.

<a id="req-position-requirements-002"></a>

## REQ-POSITION-REQUIREMENTS-002 — Propose variances

Propose Add, Replace and Strengthen variances (all allowed per DEC-HCM2-009), with unique requirement codes and valid quantity and unit pairs. Replace and Strengthen reference the source profile requirement.

Acceptance: Replace or Strengthen without a source requirement, duplicate codes and negative quantities are rejected with field errors.

<a id="req-position-requirements-003"></a>

## REQ-POSITION-REQUIREMENTS-003 — Waive with justification and authority

Per DEC-HCM2-009, a Waive preserves the source requirement and needs an encrypted justification and an impact preview. It can be approved only by an independent approver holding both the approve and the waive permissions.

Acceptance: A request containing a Waive cannot be approved by an actor without the waive permission; the justification never appears in logs or audit.

<a id="req-position-requirements-004"></a>

## REQ-POSITION-REQUIREMENTS-004 — Submit through position change approval

Variances are items of a position change request of type Change and use the Positions approval policy: one independent approver (DEC-HCM2-008). The effective set changes only when applied.

Acceptance: Rejected or withdrawn requests leave the effective set unchanged; the Positions app shows the same request.

<a id="req-position-requirements-005"></a>

## REQ-POSITION-REQUIREMENTS-005 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.job-architecture` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-position-requirements-006"></a>

## REQ-POSITION-REQUIREMENTS-006 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

<a id="req-position-requirements-007"></a>

## REQ-POSITION-REQUIREMENTS-007 — Persist and attribute correctly

Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Acceptance: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

## BUSINESS-DATA

Display: Positions: code, name, profile, variance count. Requirements: code, type, name, proficiency, minimum quantity and unit, mandatory, source, variance.

Query behavior: Positions: server mode, q code/name, filter hasVariances, sort code then id. Requirements: bounded client list (maximum 200 per position).

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

External framework codes (DEC-HCM2-010), candidate matching and skills assessment are outside HCM-2. Planned apps are not implemented through navigation links.
