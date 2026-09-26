# Job Catalogue — functional design

Status: complete for review; no open business decision blocks this app.

App `JOB_CATALOGUE`; owner `job-architecture`; delivery wave HCM-2.

## SCOPE

Define and publish the tenant’s job architecture: versioned catalogues of job families, career tracks, levels, bands and grades, and versioned job profiles that later positions use.

Actors: Tenant administrators (David) maintain and publish. HR Operations (Toby) read.

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/job-architecture/TECHNICAL-DESIGN.md) and [domain rules](../../domains/job-architecture/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Choose the Catalogue or Job profiles scope in the begin column.
2. Open the current published catalogue version or a draft; inspect families, tracks with levels, and bands with grades.
3. Create a draft successor from the published version, edit its elements, submit it for review and publish it with an effective date.
4. Create or revise a job profile on its own page, then submit and publish it.

<a id="req-job-catalogue-001"></a>

## REQ-JOB-CATALOGUE-001 — Browse catalogue versions

Show catalogue versions with status and effective range, and for a selected version its family tree, tracks with ordered levels and bands with ordered grades.

Acceptance: Published and superseded versions are read-only; the current pointer references exactly one published version.

<a id="req-job-catalogue-002"></a>

## REQ-JOB-CATALOGUE-002 — Maintain a draft catalogue version

Create a draft successor from a published version. Add, edit and retire job families at most two levels deep, levels within the two supported tracks (Individual Contributor and Management), and bands with their grades. Sequences are unique per parent.

Acceptance: A third family level, a third track kind, cycles, duplicate codes or sequences and edits to non-draft versions fail with field errors.

<a id="req-job-catalogue-003"></a>

## REQ-JOB-CATALOGUE-003 — Maintain job profiles

Create a profile with a draft version that references one published catalogue version and its family, track and level. Maintain responsibilities, requirements and allowed grades with exactly one default.

Acceptance: Cross-version references, zero or two defaults and negative quantities are rejected; profiles contain no salary or person data.

<a id="req-job-catalogue-004"></a>

## REQ-JOB-CATALOGUE-004 — Submit and publish

Draft moves to InReview, then Published with an effective-from date. Publishing closes the previous version’s range, moves the current pointer and never changes existing positions or assignments.

Acceptance: Concurrent publishes serialize; overlapping ranges are rejected by the exclusion constraint; a published version cannot be updated even by direct SQL as runtime.

<a id="req-job-catalogue-005"></a>

## REQ-JOB-CATALOGUE-005 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.job-architecture` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-job-catalogue-006"></a>

## REQ-JOB-CATALOGUE-006 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

<a id="req-job-catalogue-007"></a>

## REQ-JOB-CATALOGUE-007 — Persist and attribute correctly

Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Acceptance: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

## BUSINESS-DATA

Display: Versions: number, status, effective from/to, change summary. Profiles: code, name, family, track, level, default grade, status of current version.

Query behavior: Versions: bounded list per catalogue. Profiles: server mode; q matches code and name; filters familyId, status; sort name then id.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

External framework mappings (DEC-HCM2-010), architecture import (DEC-HCM2-011), special historical views (DEC-HCM2-012), compensation ranges and a second publication approver are outside HCM-2. Planned apps are not implemented through navigation links.
