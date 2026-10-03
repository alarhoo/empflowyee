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
