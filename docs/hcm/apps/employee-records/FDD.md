# Employee Records — functional design

Status: complete for review; no open business decision blocks this app.

App `EMPLOYEE_RECORDS`; owner `employee`; delivery wave HCM-2.

## SCOPE

Give HR one place to find any worker, inspect the complete record, correct personal facts and create new workers.

Actors: HR Operations (Toby).

Authority: [HCM-2 scope](../../roadmap/HCM-2-SCOPE.md), [decision register](../../roadmap/HCM-2-DECISIONS.md#decisions),
[domain design](../../domains/employee/TECHNICAL-DESIGN.md) and [domain rules](../../domains/employee/BUSINESS-RULES.md).
The catalogue title remains provisional; no rename is made here.

## JOURNEY

1. Search all tenant workers, including pending and ended, and open a record.
2. Inspect personal, contact, family, employment, assignment, reporting and history sections.
3. Correct personal facts with a reason; reveal emergency information only with a stated purpose.
4. Create a new worker through the staged creation route, resolving duplicate candidates first.

<a id="req-employee-records-001"></a>

## REQ-EMPLOYEE-RECORDS-001 — Find any worker

Search by name, worker number or work email and filter by employment status, legal entity, unit, department, location, worker type and record state.

Acceptance: Pending and ended workers are findable; incomplete minimal records are labelled Incomplete, never guessed.

<a id="req-employee-records-002"></a>

## REQ-EMPLOYEE-RECORDS-002 — Inspect the complete record

Show all HR-visible fields by section, all employments with their dates and statuses, assignment history, reporting lines and a worker event timeline.

Acceptance: The DTO equals the HR allowlist; emergency-purpose values are absent until revealed.

<a id="req-employee-records-003"></a>

## REQ-EMPLOYEE-RECORDS-003 — Correct personal facts

Correct names, birth date, gender, marital status, nationality, addresses, personal contacts and relationships with a required reason. Employment and assignment facts are read-only here and link to Employment Changes.

Acceptance: Each correction is revisioned and audited with field names; direct edits to employment or assignment fields have no endpoint.

<a id="req-employee-records-004"></a>

## REQ-EMPLOYEE-RECORDS-004 — Create a worker

Create person, worker number, employment, primary assignment and manager line in one staged flow with WorkforceActivation requiredness. Status is Pending for a future hire date and Active otherwise.

Acceptance: All facts commit together or not at all; worker numbers are unique; a Hired worker event is recorded.

<a id="req-employee-records-005"></a>

## REQ-EMPLOYEE-RECORDS-005 — Resolve duplicate candidates

Per DEC-HCM2-001, a candidate is an existing person with the same normalized legal name and the same birth date, or an existing employment with the same work email. Normalization ignores case, accents and repeated spaces. Any candidate blocks creation until HR records one resolution: use the existing person (continue in Employment Changes as a rehire when a worker exists), or create new with a reason. Automatic merge is forbidden.

Acceptance: A matching candidate blocks the Review step until a resolution is recorded; name-only matches without birth dates on both sides are not candidates; the resolution and reason are audited.

<a id="req-employee-records-006"></a>

## REQ-EMPLOYEE-RECORDS-006 — Reveal emergency information for a purpose

Blood group and emergency contacts are revealed only with the emergency permission and a stated purpose, and each reveal is audited as sensitive access.

Acceptance: A reveal without the permission fails; the audit event contains purpose, actor and worker ID, never the values.

<a id="req-employee-records-007"></a>

## REQ-EMPLOYEE-RECORDS-007 — Authorize independently

Every API enforces verified tenant, enabled actor, the listed business permission, entitlement `hcm.employee` and the subject scope in the TDD. Browser visibility, catalogue discovery and reporting relationships never authorize an action.

Acceptance: Direct requests with a missing grant, removed entitlement, disabled actor, foreign tenant and out-of-scope same-tenant subject fail with 403 or 404 and no data leakage.

<a id="req-employee-records-008"></a>

## REQ-EMPLOYEE-RECORDS-008 — Accessible truthful states

Use real API data with loading, empty, error/retry, denied/unavailable and read-only states. Preserve failed drafts and focus; never fall back to fixtures.

Acceptance: Keyboard-only use, 390/768/1440/2560 widths, retry, late responses after a persona switch and dirty-leave confirmation behave as specified.

<a id="req-employee-records-009"></a>

## REQ-EMPLOYEE-RECORDS-009 — Persist and attribute correctly

Commands persist state, revision, audit event and idempotency receipt in one transaction. No success is reported before commit.

Acceptance: PostgreSQL constraints and RLS hold under failure injection at each step; replay with the same key returns the first response; a different payload returns 409.

<a id="req-employee-records-010"></a>

## REQ-EMPLOYEE-RECORDS-010 — Merge a duplicate explicitly

HR may merge a duplicate person into a survivor with a reason. The duplicate becomes inactive with `merged_into_person_id` set, and reads follow the survivor chain. HCM-2 allows the merge only when the duplicate’s worker has no established employment. Merging two engaged histories needs a later correcting design.

Acceptance: Merging a duplicate with an established employment returns 409 `merge-requires-correction`; a completed merge hides the duplicate from search and keeps its history reachable from the survivor.

## BUSINESS-DATA

Display: Results: avatar, name, worker number, designation, unit, employment status, record state. Detail: sections listed in the journey.

Query behavior: Server mode. q matches normalized name, worker number prefix and work email prefix; filters status, legalEntityId, unitId, departmentId, locationId, workerTypeId, recordState; sort name or worker number, then id.

## STATES

Initial loading disables actions. Empty states explain the real reason, such as no
results for the filters or nothing assigned yet. Errors keep no stale data from another
context and offer Retry. Denied or unavailable states issue no protected child
requests. Read-only viewers see no mutation controls.

## EXCLUSIONS

Account creation and invitations (Identity Administration), identification values, nominees, photos, export and bulk edits are outside this app. Planned apps are not implemented through navigation links.
