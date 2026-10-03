# Work Schedules integration review

Date: 2026-10-03 UTC. Reviewer: Codex technical author/reviewer under the existing
[product-owner delegation](../roadmap/HCM-3-DESIGN-APPROVAL.md#authority). This is
technical integration review, not new human approval or app acceptance.

## Reviewed scope

The [Work Schedules design](../apps/work-schedules/TDD.md#delivery-integration)
reuses existing configuration tables, exact-version parsers, Access transactions,
encrypted receipts, audit and the shared worker. Migrations 48 and 49 extend the
existing query cache and retain immutable employment context for typed dated
previews. Tenant-composite references, forced RLS and restricted runtime grants
remain in place. The source family is closed; templates cannot enter ordinary
schedule publication or assignment through these routes.

Policy publication reviews an unassigned Draft's rules and verifies the absence
of assignments. Schedule/shift publication reviews a proposed dated use against
actual Workforce, policy, holiday and period inputs; it does not materialize that
proposal. Publication recomputes the dependency digest. Assignment remains the
source of durable workday resolution intents. This distinction preserves explicit
policy inputs and avoids inventing zero-hour workdays from missing prerequisites.

The [shared pattern editor](../apps/work-schedule-templates/TDD.md#shared-pattern-editor)
owns conversion, Signal Form state and maintained controls only. Features retain
API, runtime context, routing, page composition and command identity. The new
library is `type:ui`, consumes UI/util/contracts and introduces no new Nx role or
cross-product dependency. Template source imports were checked for feature-boundary
leaks; the production build and existing two template browser journeys passed
after the initial extraction. Subsequent single-shift support still requires its
own focused regression checks before this slice is accepted.

The [editor integration](../apps/work-schedules/TDD.md#editor-integration) retains
the native FCL/DynamicPage/ObjectPage design. Closed family selection and exact
version identity are navigation state. Explicit policy choices use the same
universal validation as the server. Named-account search currently requires the
Identity owner's existing read permission; missing permission remains unavailable.
The app remains in development and has no new Available tile.

## Executed evidence

- The dated publication and work-configuration PostgreSQL/API suite passed nine
  tests before selector integration. It covers draft replacement, cursor binding,
  tenant isolation, stale revisions, revoked read on receipt replay, rule review,
  durable schedule/shift publication and actual worker materialization.
- After the shared assignment preparation extraction, all eleven existing Holiday
  publication/assignment tests passed again on 2026-10-03.
- After selector integration, all ten Work Schedules PostgreSQL/API tests passed;
  the new test checks minimal reference projection, current authorization and
  closed search fields. Eight tests across the existing weekly-pattern, new shift
  conversion and policy conversion suites passed, including missing choices,
  unsafe integers, independent approval and complete persisted-rule round trips.
- Production HCM web builds passed with the schedule, shift and policy editors
  included. Existing Position Requirements unused-import and jsbi CommonJS warnings
  remain; a build is not browser acceptance.

## Remaining acceptance

Work Schedules is not Complete. Required work includes complete Leave impact
integration, override/roster precedence dependencies, real-browser business journeys
and the affected final gates. Milestone 1
also requires My Schedule and the administrator-to-employee journey. Milestones 2
and 3 remain outstanding. No status in this record constitutes acceptance of those
undelivered operations.

## Assignment review and stored inspector technical review

Reviewed on 2026-10-03 by Codex as technical author/reviewer under the existing
delegation; no fresh human approval or application acceptance is claimed. The
[bounded assignment review and inspector design](../apps/work-schedules/TDD.md#assignment-review-and-inspection)
reuses the existing tenant transaction, command receipt, source parser, exact
resolver and native ObjectPage. Review savepoints restore proposed predecessor
and successor writes. Current preview/manage/read permissions remain separate;
the result is actor-bound and commit recomputes dependency evidence. SQL receipts
retain private reasons through the existing cipher. Inspection projects only
stored public fields and never produces work. No architecture, ownership, RLS,
authentication or cross-product boundary changes are introduced. These assignment
endpoints are still unreleased implementation work, not a published external API.

Ten PostgreSQL/API tests passed after adding review and inspector coverage. The
assignment journey now proves preview replay, denied preview, unchanged assignment
and outbox counts after review, stale period evidence rejection with no committed
coverage, tampered digest rejection, successful reviewed assignment, supersession,
idempotent retry and real worker materialization. The stored inspector checks exact
local/UTC intervals, source families, missing-day status, forbidden access, closed
queries and unchanged queue count. The production web build passed with both native
sections; Work Schedules browser acceptance remains outstanding.

## Dated source integration technical review

The [dated-source integration](../apps/work-schedules/TDD.md#dated-source-integration)
and updated requirement traceability were reviewed by Codex on 2026-10-03 under
the same delegated technical authorship. Migrations 50–51 retain Attendance
ownership, tenant RLS, composite source references, monthly fences and immutable
history. The resolver uses a private one-date pattern projection and exact typed
source references rather than inserting fictitious schedule versions. Review
covered winning-source selection, prior-date rest, nullable schedule references
for real roster shifts and safe inspector projection. No new human approval or
production override approval path is claimed.

Three dated-selection tests passed. Twenty-two tests across the Work Schedules,
resolver-worker and immutable-workday PostgreSQL suites passed after integration,
including real worker revisions for ordinary schedule → published roster → approved
nonworking override, preserved prior revisions, immutable source children, forced
runtime RLS and source revision display. Roster/override sources in that test are
explicit disposable fixtures; their production command and approval journeys are
still required. The HCM web production build passed with the extended inspector.

All four existing Templates and Holiday Calendars production-build browser journeys
passed on 2026-10-03 after assignment review and inspector integration. This is
regression evidence for those apps, not Work Schedules acceptance. Local migration
48–49 and Attendance seed version 4 were applied after a verified custom-format
database backup; the existing encryption key was preserved. API liveness and the
tenant-host web entry point returned 200 after restarting only task-owned API and
worker processes. Migrations 50–51 remain disposable-database verification at this
point; ordinary API/worker startup does not apply them.

## Override draft technical review

On 2026-10-03 Codex reviewed the additive safe reload route, universal draft
restrictions, exact basis/review transactions, encrypted receipt extension and
pure source decision evaluator under the existing delegated authority. The review
checked tenant-composite ownership, forced RLS inherited from source/receipt tables,
current whole-grant dated scope and fresh replay read permission, monthly/workday
lock ordering, rollback of proposed Approved state, private-field exclusion, and
explicit rejection of evidence while its owner adapter is absent. No new trust
boundary, independent human approval or application acceptance is claimed.

The focused PostgreSQL/API suite passed 12 tests, including real override draft
creation/read and review, same-key replay and mismatched retry rejection, unauthorized
employee denial, stale workday rejection, exact cross-midnight 14,400,250 ms review,
encrypted private reason storage, and unchanged source/workday/outbox state after
preview. Three contract tests cover explicit nonworking intervals, malformed fields
and exact endpoint preservation. Four pure source-decision tests cover staged slots,
rejection/final approval, maker/beneficiary/distinct actors, current candidate and
permission checks, session expiry and stale routing/generation/revisions.

Migration 52 has only been run against disposable PostgreSQL. The persistent local
database remains at migration 49 / Attendance seed 4. The override UI, governed
evidence, submit/source-case persistence, Workflow and complete impact handling are
still required. Work Schedules and all three requested milestones remain incomplete.

## Override source-case storage technical review

On 2026-10-03 Codex reviewed migration 53 and source evaluator alignment under the
existing delegation. Review covered typed same-policy/subject references, complete
required slot creation at commit, stage ordering, requester/maker and distinct-slot
checks, decision-plus-progression atomicity, terminal/payload immutability, pending
interval protection, RLS and restricted mutation grants. The configured Override
independence constraint corrects the parser/storage to the existing owning TDD;
it introduces no new approval-policy choice and rewrites no policy row.

The focused PostgreSQL/API suite passed 13 tests. The added storage journey creates
policy and override through real APIs, arranges source-case fixtures, rejects an
incomplete case, early final approval, pending subject/interval edits, skipped stage,
maker decision, decision without progression, stale case revision and reused checker.
Two independently attributed SQL decisions then complete their required stages.
A second runtime tenant sees none of the case/slot/decision rows; runtime decision
updates and slot deletion are denied. These are structural database tests, not a
claim of production case submission or Workflow integration. Four pure evaluator
tests also passed after aligning requester exclusion. Migration 53 remains limited
to disposable PostgreSQL until explicit persistent migration orchestration.

## Override submission technical review

On 2026-10-03 Codex reviewed the submit-route integration under the existing
delegation: original actor-bound preview consumption, current period/workday/
policy resolution, complete required slots, atomic Workflow intake and safe reload
progress. The fixed current policy requires independent maker/requester/beneficiary
checks and has no pairwise-distinct configuration; submission does not invent that
additional restriction. Existing explicit slot predicates remain enforced. Review
also caught UUID-typed Workflow identities inconsistent with the physical design;
forward migration 55 preserves rows and composite FKs while restoring text IDs.
No new business decision, independent reviewer or human approval is claimed.

The focused Attendance suite passed 14 PostgreSQL/API tests and Workflow planning
passed five. Two audit-envelope tests passed; affected type/lint checks and the
worker build passed. Required-approval submit persists one case/job under concurrent
same-key retries, rejects changed input and stale review, denies an employee without
manage authority, seals narrative and returns safe Pending progress after reload.
The worker registers WorkflowPlan for the implemented Attendance source. There is
no source approval, workday publication or end-user browser acceptance claim here.
The no-approval publication path, full impact, source decisions, dispatch, timers,
evidence and UI are still incomplete.

## Pending override review

On 2026-10-03 Codex reviewed the private proposal adapter under the existing
technical delegation. It replaces temporary SQL approval with an exact Draft
candidate passed to the existing resolver. Stored source/date/revision checks,
competing-source selection and current tenant/Access boundaries remain intact.
Approval progress is excluded from the calculation digest so opening required
slots does not itself invalidate unchanged workday evidence. This introduces no
new authority, schema, public contract or business default.

The focused real PostgreSQL/API suite passed 14 tests, including review before
and after submission with equal calculation digests, an unchanged Pending case,
and unchanged workday/resolution-intent counts. This verifies a decision-path
prerequisite; it does not claim source decisions or application completion.

The attempted Work Schedules browser draft could not enter its route: the
production catalogue guard correctly denies Planned apps, including for David.
The two draft browser journeys therefore failed and are not acceptance evidence.
They remain local test drafts until the app's remaining dependencies are delivered;
the catalogue and guard were not weakened. No additional app or milestone is
complete. Persistent local migration state remains 55; migrations through 63 have
only been exercised by the disposable database harness at this point.

## Following-workday override impact

On 2026-10-03 override review was extended through the first following scheduled
Work date, retaining intervening Rest dates. This closes the case where an
extended or removed shift changes the following shift's minimum-rest comparison.
The existing resolver retains both schedule and policy Warn/Block rules. Safe
preview responses include the reviewed-through date and separate warning rows.
Missing future inputs remain unavailable; the bounded scan never invents rest.
Current authorization covers the whole dated range, including replay of stored
review evidence, and the period fence covers all reviewed months before the
source workday lock. Preview does not publish or enqueue workdays.

The focused real PostgreSQL/API suite passed all 14 tests, including the persisted
review horizon and unchanged pending-case digest. Twelve focused tests passed,
including intervening rest, a following-shift Block, independent Warn outcomes and
missing/denied future inputs. Affected lint and Attendance module TypeScript passed.
The hcm-api build, architecture, documentation/catalogue and Work Schedules
readiness checks passed. No browser acceptance was added by this API refinement.
Codex reviewed the concrete impact/range/recovery refinement under existing
technical delegation. No independent human approval or app completion is claimed.
Override native editing, complete Leave impact, final source decisions, evidence
admission and affected-date production remain outstanding. No migration or seed
changed in this refinement; persistent local PostgreSQL remains at migration 64.

## Native override editor review

On 2026-10-03 Codex reviewed the editor against the existing FDD, native composition
matrix, Signal Forms standard and real command contracts under the existing
technical delegation. The page reuses shared exact interval controls and loads
the authoritative workday revision. Its command reason and immutable source
evidence are separate; review and submit show real persisted evidence/progress.
No-approval application and governed evidence admission remain unavailable.
No new business rule, independent reviewer or human approval is claimed.

Fourteen focused frontend form tests passed, including exact override conversion
and invalid boundaries. Strict Angular compilation and the production web build
passed. The existing real PostgreSQL/API/browser command passed 62 tests across
seven suites, preserving Template and Holiday journeys after extracting their
interval controls. These results do not prove Work Schedules acceptance. The
remaining source decision, full impact, evidence and production dependencies
still prevent declaring this app Complete or enabling its tile.

## Override Leave-impact review

On 2026-10-03 Codex reviewed the owner boundary and quantity-only proposal under
the existing technical delegation. Attendance passes exact proposed workday
intervals through its application port; Leave reads and calculates its own stored
request evidence. Only safe counts and an opaque digest return to Attendance.
The existing tenant authority lock serializes current API writers; immutable
request tables retain their SELECT/INSERT-only runtime privileges. No new schema,
tenant isolation rule, human approval or request recalculation side effect is added.

The real PostgreSQL/API command passed 21 tests across the Attendance work
configuration and Leave request suites. An actual Rest override reviews three
existing Balance/Unpaid requests, identifies two changed calculations and leaves
all stored quantities/digests intact. The unchanged following-day hourly request
does not count as changed. A new request makes the original submit digest stale;
fresh review includes it. A fifteen-minute proposed interval makes the explicit
thirty-minute hourly rule unavailable. A foreign tenant binder is denied.
Forty-eight focused pure tests passed. Affected lint, API TypeScript, strict
Angular compilation, hcm-api/hcm-web builds, architecture, page structure,
documentation/catalogue and Work Schedules readiness checks passed.
This covers the admitted Draft lifecycle;
full pending/approved impact, other configuration producers and final application
are still required. No additional app or browser journey is accepted by this work.

## Override application review

On 2026-10-03 Codex reviewed the no-required-slot application path under the
existing technical delegation. Current actor-bound impact, dated authority,
period fences and the actual resolver precede atomic approval and durable work.
Any existing approval case prevents this path. Required independent slots still
create Pending obligations. Source approval is explicitly separate from background
workday publication. The dated-source digest now orders fields before hashing so
equivalent private proposals and PostgreSQL JSONB sources have identical evidence;
old stored digests are preserved and require fresh review/resolution.
No business default, schema change or new human approval is claimed.

All 22 real PostgreSQL/API tests passed across the Attendance work configuration
and Leave request suites. Coverage includes denied employee submission, identical
concurrent retries, injected queue failure rolling back source approval and its
receipt, Pending inspection, real leased-worker publication of both the override
date and following Work date, retained historical workdays and unchanged Leave
quantities. Original-key recovery remains stable after materialization; changed
input conflicts. Seventy-four focused pure tests passed, along with affected lint,
API TypeScript, strict Angular compilation and production API/web builds.
Independent source decisions, governed evidence admission, complete Leave lifecycle
impact, other configuration producers and Work Schedules browser acceptance remain
outstanding. No additional app or milestone is accepted by these checks.

Architecture, documentation, catalogue, page structure and target Work Schedules
readiness checks passed. The fresh broader admitted-app gate remains 59/61:
My Profile and Org Chart retain unrelated stale design approvals.


## Override source decision review

On 2026-10-03 Codex reviewed the internal Override decision routes, immutable
source proofs and worker composition against the existing Attendance state,
access and approval rules and Workflow authority contract. Read-only permission
remains independent from candidate eligibility. New decisions require current
whole-grant scope, an independent candidate and Runtime's original unextended
human authority. Reject closes the case while retaining an inactive Draft source.
Material source drift invalidates the case. Final approval, proof, audit and dated
resolution intents are atomic. Migration 66 adds forced-RLS immutable receipts;
Attendance seed 5 explicitly grants manager/HR source operations without enabling
any Planned app. The existing tenant mutation lock is acquired before dispatch
work to avoid concurrent shared-lock upgrades. No new business rule, authentication
boundary, human approval or complete-app acceptance is claimed.

The real PostgreSQL/API run passed 33 tests across three suites: Attendance work
configuration, Runtime action authority and Leave request Drafts. Coverage includes
concurrent HTTP admission, original-key recovery after task advancement, required
stage sequencing, independent manager/HR approval, rejection, revoked decision
access, stale input invalidation, immutable accepted proofs, cross-tenant denial,
queue-failure rollback and actual leased-worker publication of the override and
following Work date. Sixty-nine pure tests across eighteen suites passed. Affected
TypeScript, API/worker production builds and lint passed; lint reported nine
camelcase warnings and zero errors. No new browser acceptance was executed in this
slice. Governed evidence, remaining impact producers and the full native journey
remain necessary before Work Schedules can become Available.


Architecture, documentation, catalogue, page structure and Work Schedules design
readiness passed after this review. The broader admitted gate was freshly run
before this slice at 59/61, with unrelated My Profile/Org Chart stale approvals;
it is not complete-app acceptance. A verified 1,526,301-byte local PostgreSQL
backup preceded explicit application of migrations 65�66 and Attendance access 5 /
Leave access 2. The existing encryption key matched its pre-migration digest.
The rebuilt API and four documented worker lanes were restarted; liveness,
readiness and the tenant-host web entry point returned HTTP 200. No browser
business journey is inferred from these operational checks.
